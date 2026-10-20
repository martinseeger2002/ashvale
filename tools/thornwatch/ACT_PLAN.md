# Thornwatch: the whole act (plan, 2026-10-19)

2026-10-19: "What's the next chapter? Can you start getting it ready" and then "We might as well add the rest of the
chapters while we're at it." The act follows the first act of the reference game, scene for scene, in Ashvale's own names.
Public copy never names the source game.

Every chapter is a little harder than the one before it, and its offer names the recommended combat level (quest data `combat`).
Every chapter has a real-combat play test like tests/sisters_barrow_play_test.js. Nothing is released without the operator's playtest.

| # | quest id | name | giver | where | boss | combat |
|---|---|---|---|---|---|---|
| 1 | hollow_den | The Hollow Den | Isolde | Red Moor, cave | Cinderhide | 36 (live) |
| 2 | sisters_barrow | The Sisters' Barrow | Rhosyn | south of the moor | Sister Corva | 40 (branch claude/burial) |
| 3 | caged_seer | The Caged Seer | Isolde | Gloamwood, the Fivestones, Emberfall | Gnarlbark, Rakkas, Bregan | 44 |
| 4 | drowned_tower | The Drowned Tower | Hollin | the Blackmere marsh, tower cellars (4 levels) | Countess Morwen | 48 |
| 5 | smiths_hammer | The Smith's Hammer | Gwen | the abbey's outer yard and barracks | Gorrath the forgekeeper | 52 |
| 6 | thorn_maiden | The Thorn Maiden | Isolde | the abbey and its crypts (4 levels) | Maelis, Maiden of Thorns | 58 |

## Places (game tiles; the operator chose "south" for chapter 3)
- The Fivestones (stonefield): 232..308 x 244..316, below the barrow. Reached by a path round the barrow's west railing.
- The Gloamwood (darkwood): dense forest 216..300 x 322..402 below the stone field. The hollow oak is in its far corner.
- Emberfall (the burned village): a walled ruin ringed by forest and rubble, reached only through the stones' portal.
- The Blackmere (marsh): open low ground 300..420 x 410..490. The drowned tower stands in it; its cellars are an `under` zone.
- The abbey: 320..440 x 510..600. Its barracks are part of the surface zone; the crypts are an `under` zone with hatch levels.

## Chapter 3 mechanics (all existing engine data, plus two small game-agnostic engine changes)
1. Isolde: "find the hollow oak in the Gloamwood". The oak is a `mechanism` (hidden pedestal, a decor oak on the tile). Touching
   it summons Gnarlbark and his ashlings, a per-player trial. Clearing them sets flag `seer_scroll`. Hand in to Isolde, who reads
   the scroll: the five stones and their order.
2. The five stones are mechanisms that `need` the one before. The fifth sets `stones_open`, and a portal in the ring (a passage
   with `need: stones_open`) opens to Emberfall. Rakkas guards the ring as an ordinary spawn. In Emberfall, the cursed smith
   Bregan guards Hollin's cage. Goal: kills {rakkas:1, bregan:1}, `ends` at the caged Hollin. The reward `flag:seer_freed`
   empties the cage and puts Hollin in camp.
3. Talk to Isolde: reward.

Engine changes: a mechanism with `hidden: true` draws no pedestal (its decor stands on the tile). An NPC with `goneFlag` is hidden
once the player has that flag (the inverse of `hideFlag`).
