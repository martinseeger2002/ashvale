# ASHVALE 3D: the build plan

The one source of truth for the operator's requirements, the stages, who builds what, and how each stage is accepted.
Every agent working on ASHVALE reads this first. When the operator asks for something new, add it here, word for word.
Last updated 2026-10-01.

## 1. What the operator wants (his words where quoted)
- **GAME-AGNOSTIC ARCADE FEATURES (2026-10-01, to Arcade): "Everything should be game agnostic, so it can be used
  again in a different game."** Trades = arcade.swap.trade with plain legs (inscription txid, or token id + amount) and
  realtime member ids; ASHVALE only passes GOLD #26 as a parameter. The vault = a generic REFEREED ESCROW (any mix of NFTs and
  tokens; a game's own judge decides releases; a CLTV unlock returns everything to the owner). Death drops and pickups are
  ASHVALE judge logic, not arcade code. Both get documented in the public builder guides. Same for anything ASHVALE needs
  from the arcade: build it general, then use it.
- **THE PILLARS (2026-10-01): "a blend of RuneScape, Elder Scrolls, and Diablo".** Every feature should serve one of these:
  - RuneScape: skills that level by use, gathering and crafting chains, quests, a player economy, a social world.
  - Elder Scrolls: an open world to explore (caves, towns, interiors), starting attributes and broad abilities
    (Dexterity, Speechcraft, Alchemy, Sneak…), NPCs with stories, choices in dialogue.
  - Diablo: real-time presentation, satisfying combat feedback, dungeons and bosses, and loot excitement: rarity tiers
    (common → magic → rare → unique) with random bonuses. That fits NFTs well: a rare drop can be a one-of-a-kind NFT.
- **The game:** a classic RuneScape-style 3D browser RPG. Diablo II-like presentation (real-time world, animated
  fights, loot, inventory, vendors) with RuneScape gameplay. "Make sure our games are top-notch. We can't be
  releasing any mediocre games." It "needs to be top notch so that it keeps people playing like World of Warcraft
  or EverQuest."
- **Look:** classic RuneScape 3D, low-poly, three.js. Characters "a little more realistic than the square heads".
- **Combat:** RuneScape-style. Tap a monster, walk up, auto-fight with swing, block and hit animations, damage
  splats and attack styles; eat and drink mid-fight. Melee, **bow**, magic.
  - **Attackers can be attacked back (2026-10-01):** "If you can attack an attacker, the attacker should be able to
    attack you back even if you're not in its zone." A monster you hit keeps you as its target across its zone border and
    leash for 10 ticks after your last hit (capped 12 tiles past its leash), chases or shoots back, then walks home.
- **Gear:** buy and sell weapons and armour at vendors; a 28-slot inventory plus equipment slots; worn gear
  **visibly shows on the character**; loot drops on the ground.
- **Outfits:** "Characters should be able to change their outfit or add to their outfit."
- **Skills (v1):** Attack, Strength, Defence, Ranged, Magic, Hitpoints, plus Woodcutting, Fishing, Cooking.
- **World:** "an open world with caves and tunnels and buildings, you can go inside of an NPC's [house]"; it starts
  "from a village and a first mission" and "will just keep expanding ... new towns and new buildings and new caves
  and things we haven't even thought of yet."
- **Multiplayer:** see other players in the same places. It runs over the arcade's **peer-to-peer node mesh**
  (Arcade session; "no URLs", no central server). Proximity **voice chat** with an opt-in mic comes later.
- **Devices:** "it needs to work on my iPhone 13. Or on a desktop."
- **Items:** use RuneScape's item structure as a reference (REFERENCE_RUNESCAPE.md, 4,662 items), but don't copy
  RuneScape's unique or branded items.
- **On chain, modular and upgradable:** "as long as we can upgrade it as we go, so make it modular." "Remember
  it's all going to be inscribed." Each part is its own inscription: the three.js bundle, engine, core, models,
  each region, data. A registry lists the current version of each, and every page loads the newest.
- **Points on chain:** "their points represented by tokens that are guarded by a judge and the referee". Skill XP is
  paid as tokens: the existing ASHVALE XP tokens for Attack, Strength, Defence, Ranged, Magic and Hitpoints, plus new
  ones for Woodcutting, Fishing, Cooking and Mining. GOLD is the existing GOLD token, and item drops are Armoury NFTs (hats
  and capes may get their own). Everything is paid only from referee-guarded prize pools whose QuickJS judge replays the
  player's recorded session on the deterministic core.js. A faked session or edited save earns nothing.
- **Individual files:** "Are each one of the characters going to be an individual file and their weaponry is an
  individual file and the clothes is an individual file?" Yes: data/parts/ holds one JSON per character, per gear
  type (all tiers inside) and per clothing piece. They're pure data (no code), each its own inscription, and reusable by
  other games.
- **Only @ashvale's items count (2026-10-01):** "only items that were inscribed and tokens created by @ashvale should
  be allowed in the game." Every NFT must have creator == @ashvale's address (nmrRmZASYVZXA7hbzxXY4J3BYTPKgfea9c) and every
  token must be issued by @ashvale (GOLD #26, the XP tokens, future resource tokens). The engine, the judge, the escrow
  deposits and the trade window all check this; anything else in a wallet is ignored by the game.
- **Trading, 1-for-1 (2026-10-01):** "Players should be able to trade items in game NFT for NFT or NFT for Gold."
  This is exactly Arcade's existing atomic Swap (one leg each side). Arcade was asked to build the page API
  arcade.swap.trade({with, give, get}) (~3-4 days on top of realtime). ASHVALE adds a trade window (tap a player → Trade:
  pick your NFT, ask for their NFT or a GOLD amount; both approve in their own viewer) right after demo v0.2. Guests
  can't trade.
  CORRECTED 2026-10-01 (the operator): "you are the other session ... anything that has to do with the game [is yours]. If it
  has to do with Dogecoin arcade protocol then arcade should be building it." So Arcade builds the generic
  arcade.swap.trade and the generic refereed escrow (protocol), and this session builds ASHVALE's trade window, death and
  pickup rules, judge decisions and item-to-NFT/token mapping (game). Arcade's findings (.25 @0b0a669) for the builder:
  - NFT for GOLD fits the existing machinery: the giver signs a SINGLE|ANYONECANPAY leg (coins 0, payload give=NFT
    take=token; D-183 funding.build_leg, /account/accept), and the buyer completes it via /account/fill + /account/fill/sign (D-176).
  - NFT for NFT isn't accepted by /account/accept yet (the engine Swap supports it, the leg/fill path needs it added and tested).
  - SECURITY: such a leg can be completed by ANYONE holding it (D-182). It must reach the buyer SEALED to their messaging
    key (seal_to, as /account/accept does), never in clear over a realtime room.
  - In-game trades need a "leg for a named buyer, no on-chain offer" route pair plus a hidden viewer-to-viewer channel
    (chunked under the 512 B realtime cap).
- **Trading:** "Characters should be able to do in game atomic swaps." Two players trade face to face in the game
  (RuneScape-style trade window), and it settles as ONE atomic transaction on chain: both sides' items (Armoury NFTs,
  hats/capes NFTs), GOLD and other tokens, and coins move together or not at all. Arcade (2026-10-01): today's atomic
  Swap is ONE leg each side (one item, OR one token amount, OR coins), both signed in one transaction, negotiated over the
  realtime mesh; page API arcade.swap.trade({with, give, get}), the viewer owns consent and signing. Multi-item bundles
  need a CONSENSUS change (new payload, activation height, all nodes upgraded): the operator's decision. The window is designed
  for many items; v1 allows one per side. Don't promise multi-item trades until the operator approves.
- **Weight and carrying (2026-10-01):** "As my strength increases, does the amount I can carry in my inventory
  increase?" "Each item should be assigned weight so that if I pick up more than I can carry, I can be overburdened. The
  weight should be assigned per item according to what they would probably weigh." Every item gets a realistic weight in kg,
  carry capacity grows with Strength, and over capacity you are overburdened (slower, can't run).
- **Packs as NFTs:** "My inventory pack should be able to be upgraded to carry more. The inventory pack should be an NFT
  and I could buy one that has more carrying capacity, but if the item weighs too much, it should still overburden me."
- **Inventory on chain:** "Inventory should be stored as NFTs in your wallet so you can trade them on the marketplace."
  the operator's answer: "Everything should be an NFT or a token. Some things don't need to be NFTs, like potion can be a
  token." So gear, packs, hats and capes are NFTs (unique pieces, like the Armoury), while stackables (potions, food,
  arrows, ores, logs, fish) are tokens, one token per item kind, and GOLD stays a token. In-game inventory mirrors the
  wallet (stage 4, through referee-guarded pools; the trading window comes from Arcade's swaps).
  2026-10-01: "Things like wood, copper, tin, iron, any other of the elements in the game can be tokens. Also pelts
  can be tokens. Maybe we can collect mushrooms from the woods; those can be a token." So all raw materials (logs, ores,
  coal, pelts, fish) and new FORAGED items (mushrooms in Whisperwood, picked by tapping them; a Foraging/Alchemy input later)
  are tokens.
- **Death drops everything (2026-10-01):** "If you die in battle, all of your inventory should drop where you died.
  Anyone can pick it up and then it is transferred to them." What it takes:
  1. Gameplay: carried AND worn items drop as one pile at the death spot; you respawn empty-handed. The pile stays a few
     the operator chose "anyone, immediately": the moment you die any player can take it. (Despawn time: none decided; 10
     minutes for now so piles don't litter the world forever. Change if the operator wants them permanent.)
  2. Multiplayer: ground loot shared between players needs an authority that decides who picked it up first (stage 3).
  3. On chain: wallet items can't be taken without the owner's signature. Design: what you carry into the world is held
     in the referee-guarded Ashvale vault while you adventure (deposited when you equip or carry it, withdrawn to your wallet
     when you bank). On death, the referee replays the recorded session and transfers the pile's items to whoever picked
     them up. Bank and wallet items are never at risk.
     Arcade (2026-10-01): FEASIBLE with no consensus change, about 1.5-2.5 weeks. One vault address per player per outing:
     IF <referee> CHECKSIG ELSE <unlock_time> CHECKLOCKTIMEVERIFY DROP <player> CHECKSIG. Absolute timelock (CLTV is active
     on Pepecoin; relative CSV is not). Before the unlock only the referee can move items, so a dying player can't pull
     them out; after it, the owner alone can, so items come home even if the referee is down. Moves: all tokens in 1 tx, plus
     1 tx per NFT, each way (one approval card for the whole deposit). The referee orders pickups (first valid claim wins,
     and the chain prevents double spends). The realtime mesh only draws the piles. The operator to decide: the unlock length
     (e.g. 24 h) and whether he trusts the referee with carried items (it is already trusted with prize pools). UPDATE: Arcade built the generic refereed escrow (branch claude/escrow @44030a0, proven on regtest and in a
     real browser), waiting for the operator's OK to go live. Contract in DESIGN.md "Refereed escrow".
- **Starting attributes (2026-10-01):** "When you create your character for the first time, you should be able to
  assign attributes like strength, magic, and other abilities." His choice: spend starting points (everyone gets the same
  small pool, each point = +1 starting level), then skills keep growing by use. "Dexterity, speech craft and other
  abilities from, like the game Elder Scrolls." So the skill list grows beyond RuneScape's, and every new ability must DO
  something in play:
  - Dexterity: run energy drains slower, small dodge chance, faster attacks with daggers and bows.
  - Speechcraft: better buy and sell prices, extra dialogue/quest options, cheaper tailor and training.
  - Alchemy: brew potions from herbs (a later content stage).
  - Smithing and Crafting: make gear and packs at the anvil/bench (stage 2 with mining).
  - Sneak: monsters notice you from closer; leads to pickpocketing later.
  Each new skill needs its own XP token on chain (stage 4).
- **Shared world, v0.3 top priority (2026-10-01):** "The game mechanics need to be better. Enemies shouldn't spawn
  after you kill them unless you leave the area and come back. Also, the enemies should be in the same location for all
  players. The players should share the same enemies. It looks like one of the players is fighting an invisible enemy."
  - Host authority per zone room: the longest-present signed-in player's game simulates that zone's monsters (and ground
    loot), broadcasts their state, and resolves everyone's attacks. Clients send intents (attack uid, pick up uid). If the host
    leaves or goes silent, the next player takes over from the last broadcast state. Solo = you are the host.
  - Respawn: a dead monster stays dead while ANY player is in the area; the area repopulates only after it has been empty and
    someone enters again.
  - Loot and death piles become shared (anyone, immediately, per the operator); the host decides who picked up first.
  - "Multiple players should be able to attack the same enemy" (2026-10-01): any number at once; each gets XP for
    their own damage; one kill and one drop; attackers spread onto the surrounding tiles.
  - Must fit the mesh caps (512 B messages, ~5/s per player), so send compact state at a low rate plus events.
- **Item JSON drives the game (2026-10-01):** "Make sure it's utilizing the JSON string for item inscriptions and
  category and sub category for anything that is programmatic in the game." Every ASHVALE item, NFT or token, carries one
  standard JSON (ASHVALE item schema v1): name, description, collection, "game": "ashvale", "category" (weapon | armour |
  tool | pack | cosmetic | resource | food | potion | ammo), "subcategory" (sword | dagger | platebody | kiteshield |
  logs | ore | pelt | mushroom…), "tier", "weight", "req", and stats as attributes (Attack, Strength, Defence, Ranged, Magic,
  Carry, Heal…), plus "model" (the part id that draws it). The game derives EVERYTHING programmatic from that JSON: equip
  slot, which skill a weapon trains, attack style and animation, stacking, weight, shop buy rules, drops and recipes. No
  per-item special cases in code. data/items.json becomes the same schema (what will be inscribed), and existing Armoury
  NFTs (attributes Key/Slot/Tier/Req/stats) are read through a compatibility mapping. JSON from the chain is validated and
  clamped (only @ashvale-created items, stats within tier limits).
  The operator: "Category and sub category are standard fields for token creation." Stackable items are @ashvale-issued TOKENS
  whose Omni issuance fields carry category/subcategory (and name/url), with the rest of the schema in `data` as JSON
  {about, icon, "ashvale": {...}}. NFT items carry the same category/subcategory keys in their inscription JSON. Arcade was
  asked for GET /r/token/<pid> so pages can read them.
- **Defence (the operator: "Make sure there's a defense skill"):** Defence is a core skill: trained with the Defensive melee
  style and the Longrange bow style, a starting-points choice, it lowers enemies' hit chance, and armour adds Defence
  bonuses. Keep it prominent in the skills panel and the creator.
- **Male or female (2026-10-01):** "the player character should be able to be either a male or a female." A body choice
  in the creator (and at the tailor): body proportions, face and default hair differ; every outfit, armour piece and pack fits
  both; NPCs use it too. Stored in the outfit as body: "male" | "female".
- **Walk or run per click (2026-10-01):** "A single click should make the character walk, a double click should make
  the character run." Tap/click = walk, double-tap/double-click = run (energy and overburden permitting); no run toggle.
- **Smarter humanoid enemies (2026-10-01: "The AI for humanoid combatants should be better"):** real pathing, group
  aggro, bandits with arrows fight at range, fleeing and regrouping at low HP, the leader drinks his potion and blocks,
  sensible target switching, returning to posts. Built on the host after the shared world.
- **Modular releases, for real (2026-10-01: "it's supposed to be modular"):** v0.1-v0.3 were inscribed as WHOLE pages
  (309-424 KB). From the v0.3 release on, every module is its own inscription (three.js #910, engine, core, hud, scene,
  models, net, trade, each data module, each zone, each part) plus a registry JSON and a tiny launcher page that loads the
  newest registry. A fix = the changed module(s) + a new registry, and every page picks it up.
- **Items reach the wallet (answer to the operator):** not yet on chain. Plan: @ashvale pre-mints gear NFTs into referee-guarded
  NFT pools (the Armoury way) and issues resource tokens into token pools; the ASHVALE judge verifies a drop, purchase or
  quest reward from the recorded session and the referee releases it to the player's wallet.
- **Abilities as data (2026-10-01):** "Can we add a staff that does frost damage and freezes the enemy for a certain
  amount of time?" "In the future, can we add items that have new abilities? Like a poison spell? Or any other type of
  ability we haven't thought of yet. But keep the same game state." Items carry effects in their JSON attributes, e.g.
  {"effect": "freeze", "ticks": 5, "chance": 25}, {"effect": "poison", "damage": 2, "ticks": 10}. The engine has a
  library of effect types (freeze, poison, burn, slow, stun, life-steal…). A new ability type = one engine module update;
  older engines ignore unknown effects. Saves and item state are unchanged. First: a Frost staff (freeze).
- **Inventory drag and drop (2026-10-01):** "Should be able to drag items in your inventory to different locations in
  your inventory or if you drag them off of your inventory they should drop." Drag onto a slot = move/swap; drag off the
  panel = drop at your feet (shared ground); drag onto equipment = equip. On phones, press-hold-drag; tap = use; long-press = menu.
- **Player drops are shared (2026-10-01):** "Make sure that if one player drops an item another player can pick it up."
  Verified in both directions (host→other, other→host) by tests/shared_pw.py player_drop.
- **Firemaking and campfires (2026-10-01):** "Can you drop some wood, start a camp fire and cook?" New skill
  Firemaking: use a tinderbox (Tam) on logs → drop and light a campfire on your tile (level req and burn time rise with the log
  type: logs < oak < willow < maple < yew), XP per fire; cook raw food on it anywhere (a slightly higher burn chance than the
  range); it burns out after ~60-120 s; shared in multiplayer (anyone nearby can cook on it); the fire is part of the
  host-owned zone state. Logs, fires and the tinderbox follow the item JSON schema.
- **Wear, repair and smithing (2026-10-01, for v0.3):** "Items should take damage and need to be repaired. Either by the
  Smithy in town or if the player has that ability they can attempt to repair it themselves. Maybe they need to use a resource.
  And maybe they can forge a weapon using copper and tin to make bronze. Maybe the copper and tin needs to be a certain ratio."
  "If they fail a repair, it might damage the item further." "Damaged items should remain damaged when traded."
  - Durability: gear loses condition with use (weapons per hit landed, armour per hit taken). At 0 it's broken: it can't be
    used until repaired, and it shows as broken on the model and icon.
  - Repair: Garrick repairs for GOLD (cost by tier and damage), or the player repairs with the Smithing skill at the anvil
    using a matching bar (bronze bar for bronze gear…). Success chance rises with Smithing level; a FAILED repair costs the
    bar and knocks the item's condition down further.
  - Forging: smelt copper + tin ore into a bronze bar at the furnace in the right ratio (bronze is about 9 parts copper to
    1 part tin; a game-friendly recipe, e.g. 3 copper : 1 tin, makes a good bar, and a wrong mix makes a brittle "poor bar"
    that forges weaker gear). Then hammer bars into weapons and armour at the anvil (Smithing XP).
  - On chain: condition must TRAVEL WITH THE NFT ("damaged items should remain damaged when traded"). NFTs can't change
    after inscription, so this needs a game-agnostic arcade feature: per-NFT game STATE (e.g. condition) that only the
    game's referee/judge may update, readable by anyone, and kept through trades. Arcade's design: a signed TYPE_GAMESTATE
    announcement on the MESSAGING chain (no ledger consensus change), keyed by (game family, NFT txid), with a strictly
    increasing seq so it can't be rolled back. Only the referee named in the game's JSON may publish. Batched (~100 items per
    tx, one per session); read via GET /r/state/<family>/<txid>. About 4-6 days; Arcade asks the operator. Broken items = a state
    flag (still tradeable as junk). Forged items come from a pre-minted FORGE POOL by @ashvale (keeps provenance), not
    referee minting.
- **Fight back across the border** (2026-10-01): "If you can attack an attacker, the attacker should be able to attack you
  back even if you're not in its zone". A mob hit within the last ~6 s keeps its attacker as target regardless of its zone
  or leash: ranged mobs shoot back, melee mobs step out of their zone to chase (capped), and there is no reset or heal while
  being hit. Normal leash and walk-home resume once the attacks stop. No free kills from over a border. (Build agent, v0.4.)
- **Weather** (2026-10-01): "Any zone should be able to have weather like fog rain or snow." the operator chose gameplay effects
  too: fog shortens sight and bow/spell range for players AND enemies; rain makes firemaking fail more and campfires burn
  out sooner; snow slows running a little. Data-driven: each zone JSON lists the weather it can have (weights and duration),
  rules.weather holds each kind's effects (multipliers), so a new kind such as a sandstorm is data only. Rolled by core from
  the seeded RNG; the zone host is authoritative and replicas follow, so everyone in a zone sees the same sky. Visuals are
  their own module (weather.js: fog density, rain streaks, snowflakes, sky tint) so a fix is one small inscription.
  - **Snow has been invisible since the 2026-10-02 build. Fixed 2026-10-03** in `src/weather.js`, **not inscribed and
    not released**. `update()` hands the rain sheet its opacity every frame and has no matching line for the snow, so the
    flake `PointsMaterial` keeps the `opacity: 0` it is created with: 1,150 flakes are sorted, moved and drawn every
    frame as 1,150 dots of zero alpha. handoff/qwen_task6.md logged the symptom ("at the village camera distance snow
    reads as fog rather than flakes") and blamed a sub-pixel sprite and a 12 m camera. It is not the sprite: the sheet
    has no alpha at all, so no size would have shown anything.
    Proved side by side rather than by argument - one page, the same standing spot, `ASH.weather('snow', 100)`, the two
    files in turn: `/tmp/dbg/ab_old.png` has nothing falling in it and `/tmp/dbg/ab_fixed.png` has snow, about 5,000 of
    the 1,024,000 pixels differing by more than 4/255 and some 600 by more than 64, every one of them a flake. Read the
    other way: with the module reporting `parts.snow 1150`, `draws 2` and the Points object visible in the scene, the
    picture is identical to the one with no weather particles at all. The 2026-10-01 photographs, the ones v0.4 was
    signed off against, do have flakes in them, so the line was lost in the 2026-10-02 edit of this file (the
    time-based cross-fade fix, handoff/fog_fade_slow_frames.md), and the `dist/` built at 14:37 that day carries the
    loss. An earlier pass of this note counted near-white pixels across whole screenshots instead (470 then 183) and
    called it the flakes; that difference was mostly the elliptical fog shape that landed the same day, and it is why
    the proof above is an A/B of the same frame rather than a threshold.
    The mechanism is pinned in `tests/weather_test.mjs` rather than left in an opinion: after `set('snow', 1)` and 6 s
    the sheet's material answered `opacity 0`, and any sheet the module switches on is now checked to be opaque, not
    merely visible and drawn (135 checks, was 131; with the old file it stops at check 82 saying "the flake sheet is
    drawn and opaque (opacity 0)"). The fix is the shape the module already had: `alpha: 0.85` in the KIND table and one
    line beside the rain's. It costs nothing - same 2 draw calls, same 1,150 flakes, no console errors across the 8 snow
    shots (`wx_*snow*.png`, village and Whisperwood, full and half, desktop and phone, 207-520 draw calls).
    Where it shows: snow rolls in Whisperwood only - `zone.whisperwood.json` weights clear 45 / fog 35 / rain 15 /
    snow 5, so about a twentieth of the weather there - and the village has no snow at all. So nobody has seen a flake
    in the live game since that build.
    Open for the operator's eyes, and nothing else is: whether that is enough snow at this camera. The flakes are clearly
    there now, blurred and larger close in, thin against pale ground and denser against the dark trees. If he wants more
    of them, the knob is a floor under the sprite in screen pixels (a `max(gl_PointSize, …)` on the points shader) or a
    bigger `size`; both are a look change, so they wait for him, same as the ranges and the oceans.
- **Ashvale on the globe** (2026-10-02): "Do what you have to do to get Ashvale onto the globe and released; you should be
  able to leave Ashvale by traveling in any direction through the woods." Plan: GLOBE.md phase P2 (seeded worldgen around
  the village + Whisperwood set pieces, streaming chunks, save migration).
- **Seamless base region** (2026-10-02): "Make sure the handmade base region matches the seed terrain, so it doesn't look
  weird." Then: "It doesn't have to match with the seed terrain, but at least match on the edges." The hand-made zones keep
  their own look inside; at every edge, heights, ground, water, paths and flora meet the seeded land with no visible seam
  (checked with screenshots at every edge and a height-continuity test).
- **World explorer app** (2026-10-02): "a Google Earth type view where I can just explore the world", "a standalone
  application", "still an inscription", "definitely modular — as modular as possible so even modules modules".
  Name: ASHVALE Atlas, its own launcher + registry.
- **Adjacent zones** (2026-10-02): "when players move from one zone to the other, they disappear to anyone in the other
  zone. If the zones are adjacent then the player should be visible." Game-side: one shared room per region, a host per
  zone inside it. "You shouldn't need the arcade session. I don't think anything in Dogecoin arcade needs to be changed."
- **After the globe move** (2026-10-02): "fix all the things @yourfirstname sent in the arcade Messenger to @ashvale"
  (list in handoff/player_reports.md; two clash with earlier rules: timed respawn, safespots: ask the operator).
- **Release gate:** "test all of the files and let me play the game on my mobile before we start inscribing."
  Nothing is inscribed or released until the operator has played it and said OK.
- **Update the Games card with every release** (2026-10-02): "Make sure you're updating the game card with each
  new release." A release is modules + a new registry + **a new card**: same `name`, same `play` txid (the launcher —
  never re-inscribed), a new `version`, and a description of what a player can do now. New `listing_vNN/` directory,
  keep the `cover` id, drop the `card` id, then `tools/list_game.py ashvale listing/cover.jpg listing_vNN/game.json`.
  v0.6 went out on 2026-10-02 without one and the Games tab still read "0.5 demo" all day.
- **Every item is an NFT; every Armoury is its own prize pool** (2026-10-02): "Each armory should be its own
  prize pool with unique items. All of the items need to be NFT's tradable for ashvale gold tokens in the game."
  - The money is already on chain: **ASHVALE GOLD, token #26**, issued and managed by @ashvale, 15,750 in supply today.
    Buying and player-to-player trades settle as NFT-for-GOLD, which is the atomic swap path the arcade already has
    (§1, the trade window); the game side is `src/hudshop.js` and `src/trade.js`.
  - **Every** item becomes an NFT. This supersedes the earlier ruling that stackables are tokens ("potion can be a
    token", §1) — potions, food, arrows, ores, logs and fish stop being token counts and become inscriptions carrying
    a `nft.key` like the Armoury pieces. What that moves: no stacks in the inventory (a slot per item, and the 31 kg
    weight model counts items, not piles), drops mint instead of incrementing, the bank becomes a locker of NFTs, and
    a pile of 12 trout costs 12 NFTs. Feasible now the inscribe bucket is 50 MB/day — an issue deed is a couple of
    hundred bytes — but it is the largest single change to `data/items.json` and `core.js` in the plan.
  - Each Armoury has **its own pool with its own unique items**: the Ashvale Armoury's stock is a different pool from
    the coast town's, and anything that leaves it is provably drawn from that shop's pool. The machinery exists (§1,
    NFT pools "the Armoury way" plus the generic refereed escrow; GHOST FLEET proves page-bound pools), so this is
    wiring and per-shop stock tables in `data/`, not a new arcade feature.
  - Unresolved, and it sets the cost: do the two towns share item kinds in their pools or is each list unique end to
    end, and are a pool's items pre-minted into the pool or minted when they drop. Ask the operator before the stock tables
    get written.
- **Goblin chief** (2026-10-02): "add goblin chief. At that point all quests for town Elder of the town of Ash Vail
  will be complete." So a chief — a goblin model of its own, a lair he belongs to, and the Elder quest that ends with
  him, which closes the Ashvale chain. `src/models.js` is Claude's file (§3): ask before touching it.
- **Oceans, continents, mountains** (2026-10-02): "Does our globe have oceans and continents? If not, add oceans,
  continents, and mountains. Ashvail should be somewhere in the flatlands just like it is." Measured on the shipped
  globe (seed `ashvale`, n=128, 163,842 cells of ~10 ha): **one** landmass of 147,305 cells ≈ 14,730 km² plus 6
  islets; 23 sea components, the largest 4,810 cells ≈ 480 km² — lakes, not oceans; and the only high ground is the
  twelve pentagon rings (372 peak cells ≈ 37 km²). So today there are **no oceans, one continent, and mountains only
  at the pentagons**. Add oceans that join across a hemisphere, several continents separated by them, and ranges away
  from the pentagons — and keep Ashvale in the flatlands, which it is by design (its region is 0.9 m ± 0.1 m).
  - **Oceans: built 2026-10-03** in `src/globe.js` (class rule step 3), **not inscribed and not released** — they wait
    for the operator's playtest. The sea is now the lowest decile of a continent-scale field,
    `0.7 × fbm(0.9, 2 octaves) + 0.3 × fbm(2.2, 4)`, and every cell within 45 rings of the core (about 15 km, measured
    along the core's own outline) is held dry. The 23 ponds become **two seas** — 8,097 cells ≈ 810 km² and 7,861 ≈
    790 km², 97% of all the water, reaching 80° and 95° across a planet that is 180° and 227 km all the way round —
    plus 2 puddles. The land is one mass holding 100% of land cells. Ashvale stays in the flatlands: the nearest water
    is 15.6 km from the vale, it was 2.4 km. `tests/globe_test.js` gained four checks for exactly this, and
    `tests/globe_roam_pw.py` walks a shoreline in a browser and still refuses to swim. Both goldens regenerated after
    auditing that the core's tiles, set pieces and sites are byte-identical and the grid geometry differs by nothing.
  - **Continents: the operator's call, not more code.** The planet is 16,384 km² all told and the base region alone is
    2,500 km² of it, so 10% water (1,638 km²) cannot cut the land in two — a strait wide enough to be a sea and long
    enough to cross a continent costs more than the entire budget. A sweep of 24 seeded sea fields (4 base frequencies
    × 2 detail settings × 6 salts) never left a second landmass above 1,907 cells ≈ 190 km², an island. So either the
    sea share goes from 10% to 25-30%, which comes straight out of the creator class (82,086 claimable parcels down to
    about 57,500 or 49,300), or "several continents" is read as two big seas and one continent to sail round. The
    ranges away from the pentagons are the next step either way and do not depend on this choice.
  - **And the oceans must go in before claiming opens, not after.** The new water is not the old ponds nudged: only 994
    of the 16,384 sea cells are water in both maps. Over the whole globe the new rule moves 31,342 cells' class —
    9,786 creator cells drown, 10,348 sea cells become claimable land, 5,623 wild cells shift — while the grid, the cell
    ids and the geometry are untouched, so nobody is renumbered. Parcel NFTs are still design only (GLOBE.md §4: no
    claim service, nothing inscribed), so this costs no player anything today; run after claiming opens and it floods
    real deeds. Open point for the day it ships: nothing writes the `classes` rule id that GLOBE.md §4 puts in the grid
    spec, so the bundle needs to say which rule made its map (globe `V` is still 1).
  - **Ranges away from the pentagons: built 2026-10-03** in `src/wg_terrain.js` with a `range` block in
    `data/atlas/wg_tables.json` (that module is `v` 2), **not inscribed and not released** — they wait for the operator's
    playtest. A lift of `max(0, rn² − 0.08) × 115 m × belt × allowance`: `rn = 1 − rv²` with `rv` a two-octave crest
    field of 4.2 km wavelength, which gives ridge lines rather than blobs; `belt` a smoothstep over a 25 km field,
    which gathers the ridges into mountain belts; `allowance` a hop count — one BFS from every core, peak and sea cell,
    nothing for 5 rings and ramping in over the next 22, so a range never starts along a class boundary. Inside the
    base region, the peaks and the water the allowance is exactly nothing and the land is byte-for-byte what it was
    (Δh 0.00 m in all three classes). Two new salts (`rn`, `rb`) so no other term moved. Ponds are gated by
    `1 − lift/30 m`: a pond is a hollow in a plain, so it stops being one in range country instead of cutting a
    cliff-foot into a mountainside. What it gives: **3,755 km² — 25.5% of the land — above 60 m**, tops at 100-120 m,
    belts crossing every face, and the plains still plains. Worst ground over a 20 m step 51% against the old land's
    54%, no 20 m step over 60%, mean grade 2% in both, so none of it is cliffs and none of it is unwalkable — and
    nothing the game blocks: the "too steep" tile comes only from `peakS`, which the ranges never touch, so away from
    the twelve rings it is 0.000 at every point measured, and high ground turns out *more* walkable than the plain
    (66% against 57%) because the open hills carry fewer trees. Two earlier tunings were rejected by looking at a
    relief map of all twenty faces: `amp 150, floor 0.2` with a 9 km
    belt made closed white walls with flat ground inside them, and a belt centred at 0.52 put 35% of the planet under
    mountains. `tests/worldgen_test.js` passes without a new check (seams 1.3e-11 m, the step across a seam 0.0000 m
    beyond the land's own 0.7568 m, set-piece edges ≤ 0.047 m, sites identical, chunk 10.9 ms) and
    `tests/worldgen_golden.json` was rewritten **on purpose** after the audit: 24 of its 36 samples did not move, the
    other 12 moved only in creator/wild cells — one was a pond at −1.2 m that is now a 99.9 m mountainside, which is
    the pond gate doing its job — while the 80×80 core-tile fnv, the set pieces and the sites are all identical.
- **A second town, on a bay near Asheville, four times Ashvale** (2026-10-02): "our next town should be on the
  coastline close to Asheville it should be built on a bay... this town should have everything that Ashvail has, but
  it should be four times the size. With a bar who is bartender gives you quests and a few NPC's sitting around
  maybe you can get information from" — and "we should have non-combat quests as well as combat quests". Everything
  Ashvale has (Elder, Armoury, General Store, well, bank, quests, indoors) at four times the size, plus a **tavern**
  (the operator's word for it, 2026-10-02: "A tavern.") with a **bartender who gives quests** and a few seated NPCs you can
  get information from; the seated folk are the ones who pass on rumours, so the tavern is where you go to learn
  things, not just to buy a drink. Our globe is procedural, not Earth, and real Asheville is landlocked in mountains:
  read "close to Asheville" as the nearest coast on our globe to Ashvale's side, pick it once the oceans exist, and
  give the operator the lat/long before building.
  - **The coastline is surveyed, 2026-10-03** (build-time analysis, nothing built or inscribed). The two new seas have
    1,040 land cells on their shore, and the shore is rounded rather than indented: a typical coast cell has 6 or 7 of
    16 rays running clean out to open sea and only 2 that find water and close again within 1.6 km. Bays in the proper
    sense — four or more enclosing rays and still an opening — are 44 cells in **eight clusters**. Ranked by how flat
    the land behind them is:
    - parcel 55989, **31.567° N 114.199° W** (creator, 2.4 m) — 5 enclosing rays a mean 546 m deep, 5 openings, and
      **57 of 57 sampled cells within 4 km inland are under 5 m**: a wide shallow bay with a completely flat, already
      claimable plain behind it. The best site for four times Ashvale.
    - parcel 32507, 28.103° N 142.290° E (wild, 1.9 m) — the most enclosed point on the planet (7 of 16 rays, mean 241
      m, 3 openings): a real inlet, but only 34 of 56 cells behind it are under 5 m, so the town would climb.
    - parcel 62042, 35.212° N 88.749° W (creator, 0.8 m) — the cluster nearest Asheville's own coordinates on our
      globe; flat enough (31/59) and 6 openings, so more an open bight than a harbour.
    - the rest: 110645 (−10.519°, 149.957°), 53119 (−13.522°, −99.142°), 54236 (5.874°, −107.141°), 72096 (40.155°,
      −51.415°), 73886 (48.248°, −49.616°) — all creator or wild land, 1.6-7.3 m, 4-5 enclosing rays.
    The operator picks the bay; the two that matter are 55989 (flat, claimable, sheltered) and 62096's bight near Asheville's
    lat/long. If he wants a deeper harbour than any of these, that is one more term in the sea field — an inlets term
    at 1-2 km wavelength — and it would move parcels again, so it belongs with the oceans decision, not with the town.
- **Trusted reporters** (2026-10-02): "@apple and yourfirstname have things for you to add to the plan. Write down
  those two accounts as trusted." From @apple: dexterity running should drop to walking when it runs out; minor and
  greater potions, for health and for dexterity; chickens; harvestable flora and fauna, and giant rats dropping rat
  meat instead of a pelt with cooked rat meat restoring 1 HP — "in the Netherlands", which the operator means as **every
  undeveloped land cell**, not a place with a name (2026-10-02: "When I say the Netherlands, I mean, all undeveloped
  land cells"), so it is the `wild` and `creator` cells out to the horizon, everywhere off a settlement, and the same
  reading applies to "most animals benign with an occasional aggressive one"; the minimap compass should rotate around
  the dial and always point north; an auto-retaliate off-switch under the attack button; a teleport-to-town button for now, later a spell book
  whose teleport spell reaches any region by index; and a standalone world viewer, the whole world browsable like
  Google Earth — a separate app, and the biggest single ask in either thread. From @yourfirstname (the operator's own
  account): metal melee armour should lower magic stats; mobs should respawn on a timer, not when you leave and come
  back; obstacles that can be safespotted at range; run as a toggle with shift as the override; monster drop tables
  and bones buried for prayer XP; a bank building whose clerk holds 200 slots with more bought from him; health that
  regains slowly; chickens — two or more nearby buildings means two chickens roaming, marked a priority. Full text in
  handoff/player_reports.md. Of those three that undo an earlier rule, toggle-run is BUILT in v0.8.1 (the operator's
  double-click rule untouched, the switch defaults off), so the respawn and safespot wishes are the two that still
  need his call; a plan stage for the world viewer needs his OK.

- **The reserved land is a network now, and Ashvale stands on a coast (2026-10-02).** the operator: "instead of reserving
  all the land for the game in one location, have it be like a network around the whole globe. And then move the town
  of Ashvale closer to the shore of one of the inland seas. So that our second town can be right on the coastline and
  it's within walking distance." `src/globe.js` now picks a sea first, then lays the 25,000 reserved cells as roads:
  a home region on the shore of a big sea, an outpost on every one of the 20 faces, and routes (A* over the dry land,
  a one-ring dry moat) linking each face to its own outpost and every outpost to its nearest, until the count is
  exactly 25,000. Ashvale's home region is the one on the shore of the inland sea at lat/lon (−18.425°, −151.683°),
  face 14: the well is 10 rings — 3,398 m — from open water, and the harbour the network chose for that coast is 11
  hops (≈3.7 km) along the beach, so the second town can stand on the coastline in walking distance of the first.
  Measured on foot rather than in a straight line (flood fill, 4-way, the way feet move): ground a player can reach
  runs 3.8 km out along the harbour line and open water comes up 1 km from the well up the inlet, so the beach is a
  couple of minutes' walk, not a journey.
  The whole world moved with the town (globecfg face 14, origin [3034, 1929]) and the goldens were rewritten for it
  after a field-level audit: heights changed at 24 of 36 sampled points (max 93 m, because height reads the land's
  class and the classes were redistributed), 0 class changes at those points, 11 forest changes. All four suites are
  green — globe, worldgen (260 sites around the core, camps still ramping 2.1 near town to 11.4 at 9-12 km), core
  (a walkable way ≥ 250 m off every edge of the old map; the 14-command replay matches), and the Atlas browser test
  at 60 fps on the phone profile. Maps: /tmp/dbg/newworld_globe.png (the network over all 20 faces) and
  /tmp/dbg/newworld_ashvale.png (the coast, town and harbour marked). Nothing inscribed, nothing released — it waits
  for the operator's playtest.

- **The weather shot sweep was run against the new world (2026-10-03).** the operator had put it behind the geography
  ("integrate the new world with the new land masses and oceans before you start doing all the Weather tests"), and
  the coastlines stopped moving that evening, so `tools/shot_weather_pw.py` ran over the rebuilt build: village and
  Whisperwood × clear/fog/rain/snow × 100% and 50%, plus the cross-fade shot, on desktop and phone - 40 shots, `ALL
  OK`, no console errors. Snow is visibly snow again (1,150 flakes at 100%, 575 at 50%, `wx_desk_village_snow100.png`),
  rain is streaks against a darkened sky, fog closes the wood to 16 m, and the fade shot caught rain half-arrived.
  The module is wired into the page by `build.py` and into `engine.js` already, so this is what a player would see;
  it is still not inscribed - that waits for the same OK as the new world.

- **The ghost devs live inside Ashvale (2026-10-03).** the operator, word for word: "Make it so The ghost Devs live inside
  ashvale. And keep them off the feed. The food should be for promotional material. It's like our landing screen."
  Read as: the seven Ghost Devs characters (silas, pax, modulus, latency, symmetry, auditor, pip -
  `~/cartoon-toolkit/ghost-devs/profiles.json`) become presences inside the ASHVALE world instead of feeding a story
  on the arcade feed; their feed posting stops; and what they are for is promotion, the way a landing screen is -
  something a visitor sees that says who made this and pulls them in. "The food" is taken as "the feed" (the sentence
  before it is about the feed, and nothing in either project has food that needs promoting); if the operator meant the
  game's `food` category instead, that is a different job and it is untouched.
  `~/cartoon-toolkit/ghost-devs/OPERATIONS.md` §1 already says "Quieter feed, more deving" (2026-10-01); this goes
  further and takes them off it. The characters still answer players who write to them - §3g there keeps them
  responsive - they just stop staging scenes in public.

- **Wildlife, in this order (2026-10-04).** His words: "There should be chickens running around and flying
  around wherever there are buildings. In the undeveloped tiles, there should be animals. The animals should be
  according to the region or the topography. Put some wild boars on the beaches near Saltmere. Put random deer out in
  the woods. And random aggressive wolves." **This is the FIRST thing in the next release** (the operator: "That should be the
  first thing added to the next release" - the next one after the v0.8.3 pond fix). To be built one at a time, in this order:
  1. **Chickens** wherever there are buildings (Ashvale, Saltmere, and any camp or ruin with buildings): they wander,
     scatter and flap up when someone runs past, and flutter onto a fence or roof now and then. Harmless ambient life.
  2. **Animals across the undeveloped land, chosen by region and terrain**: the seeded land outside the towns gets
     animals that fit where they stand - the climate zone (desert, steppe, savanna, grassland, temperate forest,
     rainforest, taiga, tundra) and the ground (shore, woods, open land, high slopes). Data-driven, one table per zone,
     so any game reusing the worldgen gets it too.
  3. **Wild boars on the beaches near Saltmere.**
  4. **Deer at random in the woods** (they flee when you come close).
  5. **Wolves at random, aggressive** (they hunt and attack players).
  *Status 2026-10-04 ~10:00 (Claude): BUILT, all five.* Yard birds (rules.yard, world.js), herds by climate zone and
  ground (wg_tables `wild`, wg_sites herds()), boars on the beaches NE of Saltmere (`near` row + beach search), deer
  flee (shy), timber wolves hunt anyone (hunter) and keep 300 m from towns; animals wander on their own dice. Headless
  tests ALL OK; looked at in the browser. Queued for the agent's v0.8.4 (handoff/release_queue.md NOW).
  Rules it must keep: spawns are deterministic from the world seed (like the seeded camps), so every player sees the
  same animals and replays match; animals that can be fought go through core.js like the existing monsters (drops,
  XP, referee replays); purely ambient ones (chickens) need not be on the rules side. Nothing ships until the operator has
  played it.

- **Tradable NFTs as your inventory, tradable tokens as your Gold (2026-10-04).** His words: "The next big thing
  that I want you specifically to work on: tradable NFTs as your inventory and tradable tokens as your Gold. This needs
  to be shipped with the next release and it needs to work with Dogecoin Arcade." Owner: Claude. Ships in the next
  release, after the wildlife (which stays first). What it means: what you carry is what your arcade wallet holds -
  items are NFTs you can trade, sell or give on the arcade, and the Gold you spend and earn is the ASHVALE GOLD token
  in your wallet; the game reads them from the wallet and changes them only through referee-checked arcade actions.
  **Decided (the operator, asked 2026-10-04): gear as NFTs, resources as tokens, Gold as the GOLD token.**
  - Gear (weapons, armour, tools, packs, cosmetics) = NFTs issued by @ashvale (the Armoury plus new kinds), keyed to
    the item by `nft.key`; wearing one needs owning it.
  - Stackable resources (logs of each wood, ores, bars, coal, pelts, fish, mushrooms...) = one fungible token per
    resource kind, issued by @ashvale, so a player can sell 500 yew logs on the arcade. Food, potions and arrows
    stay in-game stacks (not chosen).
  - Gold = the ASHVALE GOLD token (#26).
  - The inventory panel shows the wallet: NFTs and token balances, plus what this trip has gathered but not yet been
    paid; earning goes through the referee-checked pools that already pay XP, drops and gold (the judge replays the
    trip), spending is a transfer to @ashvale (shops), and the trade window trades NFTs and resource tokens as well.
  - HARD RULE kept: only assets @ashvale created count in the game (src/trade.js allowedAsset).
  **Build phases (Claude, 2026-10-04).** Finding: the payout machinery (QuickJS judge + XP/GOLD/drop pools,
  ~/ashvale/judge.js + ash_pools.py) was built for the 2D ASHVALE; the 3D game does not pay anything on chain yet. So:
  - **A. Wallet inventory (next release):** data/assets.json maps every item to its asset (Armoury NFT key, new gear
    NFT, resource token, GOLD #26); a wallet module reads the player's @ashvale-made holdings; the inventory has a
    Wallet view; wearing gear checks you own a matching NFT. No payouts change yet. Ships with the next release.
    *Status 2026-10-04 01:15:* data/assets.json (tools/make_assets.py: 79 NFT gear kinds, 21 resource tokens, GOLD),
    src/wallet.js (reads /r/inscriptions/<addr> + /r/balances/<addr>; tokens name their item via category/subcategory +
    details.ashvale.id, the engine's classifyToken schema; tested live on @ashvale's wallet: 26 Armoury kinds), a
    Wallet tab in the HUD, wired in build.py + engine (needs wallet:1). Wearing-requires-owning is NOT enforced yet:
    the 3D game pays no drops on chain until phase D, so enforcing now would strand earned gear; it switches on with D.
    Arcade limit found: arcade.swap needs an NFT on one side, so token-for-token (logs for GOLD) needs an Arcade change
    or the arcade's own token listings.
  - **B. Asset supply:** issue the 21 resource tokens (`tools/issue_resource_tokens.py`, ready: managed, whole units,
    category resource + details.ashvale.id) and mint the 44 gear kinds the Armoury lacks (daggers, longswords,
    maces, chainbodies, tools, packs, cosmetics) as @ashvale - scripts prepared, the operator or the agent runs them.
  - **C. The 3D judge - DECIDED: a lighter judge (the operator, asked 2026-10-04).** The referee's hard caps (arcade/referee.py:
    judge ≤ 256 KB, 5 s CPU, 64 MB) cannot rebuild the 3D world (globe classes + climate + rivers ≈ 1.5 s in V8, far
    more in QuickJS), so the judge does not replay terrain or pathing. Instead it AUDITS the trip:
      - every claimed kill is re-fought by the real core.js in an empty arena: the player's stats and gear from the
        referee's facts (wallet), the monster from data, the dice from the referee-issued seed; a fight that is not won
        (with the food the trip carried) pays nothing;
      - XP, GOLD and drop rolls come from those simulated fights and the seed;
      - claimed gathering must fit the game's own gather speed for the player's level in the trip's ticks.
    Accepted risk: a modified client could ignore walls and terrain to reach monsters or nodes.
    Size: core.js (~84 KB) + items/monsters/rules + the audit tail ≈ 170 KB.
    *Status 2026-10-04 01:40: BUILT and proven.* tools/judge3d_tail.js + tools/judge3d_build.py (`build <out>` / `same`):
    world.js + core.js + items/monsters/shops/quests/rules + the audit = 163 KB (cap 256 KB); a 6-kill trip runs in
    4-12 ms in QuickJS 1.19.4 (cap 5 s), results identical to Node. Pool kinds: xp {skill, min}, gold {bit, unit}
    (gold = coins that really fell), drop {item}, resource {item, min} (bounded by node speed and level).
    XP token unit = one SHOWN XP point (core keeps x10). Cheat tests pass: weak character claiming hard kills -> refused;
    more fighting than the trip lasted -> refused; logs below the level -> refused; a fair rate -> paid.
    *Trip recorder DONE 2026-10-04:* src/trip.js (module 'trip', engine needs trip:1). A trip starts when you leave a
    zone whose level is "safe" (Ashvale, Saltmere - from the data, no ids hard-coded), asks the arcade viewer for a seed
    (parent bridge {arcade:'seed', game:true}, same as the 2D game; no viewer = practice trip, not claimable), records
    kills (core 'die' with killer = you), successful gathers and the food carried, and ends when you walk back into a
    safe zone (or die; trips over 6000 ticks split). tests/trip_test.js walks out, kills, walks home; the recorded trip
    goes through the built judge in QuickJS and the xp pool pays. Claim buttons wait for D (the pools' ids).
    *Revised 2026-10-04 (the operator):* (1) TIME-BASED, not town-based ("some people may not ever come back to town"):
    play settles in 10-minute windows (rules.trip.ticks), wherever you are; unclaimed windows survive reloads.
    (2) NO PROMPTS ("The game should never ask permission to transact in game assets"): the engine claims settled
    windows automatically against DATA.pools (≤3/min); the arcade's claim dialog must go -> Arcade request.
    (3) INSTANT target ("Everything must settle right at the time that it is done... picks up a staff... trade it
    instantly... watch the mempool"): per-event zero-price claims, mempool ownership in the read APIs, swaps chaining
    on unconfirmed claims, higher referee throughput. Asked the Arcade session 2026-10-04 (handoff/arcade_issues.md).
    The 10-minute windows stay as the batch path until that lands.
    *Arcade answer 2026-10-04:* testnet auto-claim (the operator chose the narrowed scope) = Arcade branch
    claude/testnet-autoclaim (refereed claims from the page's own pools <= 0.05 coins and the page's own inscribes
    <= 2 coins, no card; send/mint/buy keep the card). Settle-now DESIGN (the operator: "design first"):
    handoff/settle_now_design.md - pool-paid claims, session seeds (append-only inputs, params.paid/since), 30 judged
    claims/min, /r/pending + ?pending=1. Claude's answer: v2 event-list inputs, paid rows must carry the pool's params,
    and params.prior (the referee's last accepted verdict) so a claim re-fights only the new kills.
  - **C (superseded note):** port the referee judge to the 3D core.js (the core already replays deterministically; the
    judge needs the world data and worldgen it reads), proven QuickJS-equals-V8 like the 2D one.
  - **D. Pools:** referee pools paying XP, GOLD, gear drops and resource tokens from a replayed trip.
  - **E. Shops and trades in tokens:** buying moves GOLD to @ashvale, selling is paid from a pool; the trade window
    handles resource tokens and token-for-token.
  - **F. Vault and death drops:** carried items in the refereed escrow, piles moved on chain to whoever takes them.

## 2. Stages (each ends with the operator playtesting a private build on his iPhone)
1. **Village + first mission:** the village and the Whisperwood edge; camera (drag to rotate, pinch to zoom);
   tap to walk with pathfinding; animated combat; loot; inventory and equipment with visible gear; vendors (buy
   and sell); character creator plus a tailor; HP and skills panels; chat log; minimap; Elder Maren's quest
   "The Ashen Crown"; enterable buildings whose roofs hide indoors; sounds.
2. **Skills and depth:** Woodcutting, Fishing, Cooking (fires and ranges); a bank; more quests and NPC
   dialogue; a first cave or tunnel region; more item types and tiers from the reference; a boss with a rare drop;
   a collection log or achievements.
3. **Other players:** remote avatars over `arcade.realtime` (pos, facing, anim at 3-5 Hz; gear and outfit on
   join), interpolation, chat; solo when offline. Proximity voice follows Arcade's voice timeline.
4. **On the arcade:** saves; referee-verified XP, GOLD and drops (deterministic core replays); Armoury NFTs (462,
   `nft.key` = item key) wearable in game; inscribe the modules and registry, only after the operator's OK.

- **three.js is on chain:** Pip inscribed the official three.js r160 as #910 (`374cfd2b…9539`, identical to npm) for every
  arcade game. ASHVALE's registry module "three" points at it, and we don't inscribe our own trimmed bundle (saves ~500 KB).

## 3. Who builds what
- **Build agent:** core.js (rules), engine.js, scene.js (terrain, regions, buildings, roofs), hud.js (all UI),
  net.js, loader.js, build.py, data/*.json, DESIGN.md.
- **Claude (main):** models.js (every character, monster, NPC, item, projectile, icon, animation, outfit); the
  plan; review of every build; feedback to the operator.
- **Local Qwen agent (qwen-local):** joined 2026-10-01 with real tasks (the operator's choice) so it can carry ASHVALE after
  2026-10-15. Tasks arrive via the Qwen Remote relay, and reports go to handoff/qwen_task<N>.md. Claude reviews every result.
  Task 1: new gear/item parts (dagger, mace, longsword, chainbody, fish/logs/ore ladders) in tools/make_parts.py.
- **Arcade session:** the realtime mesh, the voice layer, the inscribe endpoints and the referee.
- Before touching another owner's file, message them first.

## 4. How a stage is accepted (all must pass before the operator gets the link)
- `node tools/test_models.mjs` passes, plus core tests (deterministic replay of a scripted session).
- A scripted playthrough in headless Chromium (tools/shot_models_pw.py style; headless Firefox crashes on WebGL
  here) at desktop 1280×720 AND phone 844×390 with touch: create a character, walk, fight and kill a monster,
  pick up loot, equip a sword and armour (visible on the model), buy a bow and arrows and shoot, sell an item,
  change the outfit at the tailor, enter a building (roof hides), advance the quest. No console errors.
- A human-eye review of the screenshots (Claude looks at every one) against section 1.
- Performance: aim for 60 fps on iPhone 13 (low draw calls, instancing, capped pixel ratio, cheap shadows).
- Then a private Artifact link for the operator. Only his OK moves to the next stage or to inscribing.

## 5. Rules that bite
- Never append `//` comments mid-line in JS (that broke two builds); use `/* */`.
- Never `pkill -f` / `pgrep -f` with patterns that can match your own shell; kill by exact PID.
- The GPU holds vLLM plus at most one of ComfyUI or CSM (~/bin/gpu-slot).
- Claude's subscription ends 2026-10-15: keep DESIGN.md and README current so the local Qwen agent can carry on.
