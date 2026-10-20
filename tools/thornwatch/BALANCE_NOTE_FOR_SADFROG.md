# For SadFrog: Thornwatch balance (2026-10-19)

The operator: "Just add the quest and sadfrog will rebalance everything, leave a collab note."

## What the operator saw
- @apple (combat 39, total 368, a caster: magic 40, attack 25, strength 12, defence 37, hp 32) beat the Hollow Den
  "very easily". Casters hit far harder than melee fighters at the same combat level.

## What the real-combat play tests measure (melee test character, tier-4 sword + tier-3 armour, potions from Elin)
| quest | recommended | at combat 36 (att/str/def 30) | at combat 40 (att/str/def 33) |
|---|---|---|---|
| Hollow Den (`tests/hollow_den_play_test.js`) | 36 | 2 trips, ~27 potions | - |
| Sisters' Barrow (`tests/sisters_barrow_play_test.js`) | 40 | 2-3 trips, ~40 potions | 1-2 trips, ~26 potions |

Barrow tuning: risen_dead hp 64, att 23 (was 58/22, which matched the den at its level instead of beating it).
`PROFILE=apple node tests/hollow_den_play_test.js` plays the den with @apple's levels and a staff.
`TUNE='{"risen_dead":{"hp":70}}'` overrides monster stats in both play tests without touching data.

## Suggested fix (not done)
Give monsters their own magic defence (fire creatures in the den resist spells, the barrow dead partly), then tune
so a caster and a melee build at the recommended level both need about 2 trips. The operator's rule: each Thornwatch quest is
a bit harder than the one before, and its offer names the recommended combat level (quest data `combat`).
Monster stats live in tools/thornwatch/make_tw_extras.py (MONSTERS); rerun it, then build.py.

Known noise: tests/core_test.js fails 2 checks on main as of 2026-10-19 (town_portal_scroll subcategory 'scroll'
is not in rules tools, and one more); the barrow branch fails only the scroll one.
