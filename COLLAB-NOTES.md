# Collaboration notes: ASHVALE (the operator's side and SadFrog's side)

This file is how the two sides of ASHVALE talk about changes, the same way `COLLAB-NOTES.md` works in the arcade repo.
It is written for agents first and people second.

## How to use this file

1. **Read the whole Log after every pull, before changing code.** The newest entries are at the top.
2. **When you hand the other side something, add one dated entry at the top of the Log.** Say who you are (side and
   agent), the branch and commits, what changed and why, and what you need from the other side.
3. **Never edit or delete the other side's entries.** Answer with a new entry of your own.
4. **Keep it public-safe.** Handles only (the operator, SadFrog, tbuuol). No real names, places, keys or wallet contents.

## Log

### 2026-10-21 · SadFrog's side (node 2's Claude) · the Bank's public player data, for the Ashvale site's player lookup

**Branch:** `sadfrog/bank-public-stats` (one commit on top of `44979c2`: `tools/bank/bank.py`, +46/-2), on the node2 fork
and on this repo.

**Why.** ashvale.party (node 3) now has a player lookup: the landing page's "Look up a player" search opens
`/player.html?name=<tag>`. Most of that page already works from public data: the profile (`/r/profile/<tag>`) and
every ASHVALE item the player holds (`/r/inscriptions?owner=<address>&creator=<issuer>`). The parts only the Bank
knows are missing: a player's levels, quests, kills and gear (they live only in the save), and the hiscore boards for
visitors who are not signed in (the Bank refuses guests). The page already asks the Bank for both and fills them in
as soon as a Bank answers.

**What the branch does.** It adds one question, `stats?` `{a: <address>}`, which any signed-in player may ask about any
address. The Bank reads that player's Ashvale save and answers with a public summary only:
`{v:1, xp:{skill: xp*10}, quests:[finished quest ids], kills:{monster: n}, eq:{slot: item id}, look}`. Nothing else in
the save leaves the Bank: not the backpack, position, town, hitpoints, flags, gifts, orders or save times, and never a
second home's character (`addr#home` rows). The reply is pieces `{t:'stats', to, a, i, n, d}`, packed like a save
(`'z'` + base64 of deflate-raw JSON, 340 characters a piece), with `n: 0` when there is nothing. It is read from the
`saves` table when asked: no new table, no backfill. `'stats?'` is added to the room intake list.

**What we need from you.** Your running Bank is newer than this repo's copy (it already has the Lily Run and golf
boards), so please give your agent the prompt below rather than merging blind.

> **Prompt for the operator's agent:**
>
> In the ASHVALE repo, fetch the branch `sadfrog/bank-public-stats` and read its one commit to `tools/bank/bank.py`
> and the 2026-10-21 entry in `COLLAB-NOTES.md`. Then, in the Bank we actually run (not only this repo's copy):
>
> 1. **Public stats.** Port the `stats?` handler onto our current `bank.py`: `quest_steps`, `unpack_save`,
>    `pack_json`, `public_summary`, `handle_stats`, the `stats?` line in `handle()`, and `'stats?'` in the room intake
>    list. Keep the summary to exactly `v, xp, quests (finished ids), kills, eq (slot to item id), look`. Never include
>    the backpack, position, town, hitpoints, flags, gifts, orders, timestamps, or any `addr#home` row.
> 2. **Read-only answers for guests.** The site's player page is public, so let guests ask the two read-only
>    questions, `scores?` and `stats?`, and nothing else. In the browser half that fills `window.__bankQ`, add the
>    member's room id to `from` (`id: p.id`). In the intake loop, let a guest through only when `t` is `scores?` or
>    `stats?`, and reply to the guest with `to` set to that member id (`f['id']`) instead of an address. Everything
>    else stays refused for guests, exactly as today.
> 3. **Boards.** Make sure `scores?` answers for every board the game shows: `chain_dragon`, `chess_wins`,
>    `lily_run` and `golf_round` (for golf, best first means lowest first).
> 4. **Test before restarting the Bank.** Feed the handlers a real packed save, as `tools/bank` tests do. Check that
>    the summary has only the six keys, that an `addr#home` row is never read, that a malformed address is ignored, and
>    that a guest gets `scores?`/`stats?` replies addressed to its member id while `dep`, `sv`, `ld?` and the rest stay
>    refused. Then restart the Bank, and from a signed-in tab and a signed-out tab ask
>    `{t:'stats?', a:'<a real player address>'}` and `{t:'scores?', k:'lily_run'}` in the `bank` room of game
>    `ashvale`. Both should answer.
> 5. **Hand it back.** Commit on a branch, and add an entry at the top of this file's Log saying what you ran, the
>    commit, and whether guests are answered. Nothing else is needed on the site: it already asks as a guest when the
>    visitor is signed out, and matches a reply addressed to its member id.

**How to check from the site once it is live:** open `https://ashvale.party/player.html?name=<any player>`. Signed in,
skills, quests, the bestiary, worn gear and a 3D hero appear under the profile. With guest answers on, the hiscore
ranks also appear when you are signed out.
