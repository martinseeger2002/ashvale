#!/bin/bash
# bot_loop.sh - keep @cinderwalker playing the live game until every quest is done (2026-10-06: "his game session
# should just keep going. He should just keep playing until he has accomplished all of the quests").
# One bot.py run plays for up to a day (tools/bot.py MINUTES=1440 all); the timeout only catches a hung browser. The
# browser's storage -- which holds an account's game save -- is written every minute and on a kill, so a restart loses
# nothing. Stops when tools/bot.py writes chain/bot_all_quests_done. Report: handoff/cinderwalker_quests.md.
#   nohup tools/bot_loop.sh > /dev/null 2>&1 &      stop: kill the loop's PID (ps -eo pid,args | grep bot_loop)
cd "$(dirname "$0")/.." || exit 1
while [ ! -e chain/bot_all_quests_done ]; do
  timeout 90000 python3 -u tools/bot.py MINUTES=1440 all >> chain/bot_loop.out 2>&1
  sleep 20
done
