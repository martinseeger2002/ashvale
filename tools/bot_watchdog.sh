#!/bin/bash
# bot_watchdog.sh - restart @cinderwalker when he hangs (2026-10-07: a portal trip sat 16 minutes inside one browser call,
# deaf to SIGTERM). If chain/bot.log has not been written for 12 minutes, the bot.py run is stopped: SIGTERM first (it saves
# and exits between steps), SIGKILL a minute later if it is still there. tools/bot_loop.sh starts the next run.
#   nohup tools/bot_watchdog.sh > /dev/null 2>&1 &
cd "$(dirname "$0")/.." || exit 1
STALE=720
while [ ! -e chain/bot_all_quests_done ]; do
  sleep 60
  age=$(( $(date +%s) - $(stat -c %Y chain/bot.log 2>/dev/null || date +%s) ))
  [ "$age" -lt "$STALE" ] && continue
  pid=$(pgrep -f "python3 -u tools/bot.py" | while read p; do [ "$(ps -o comm= -p "$p")" != timeout ] && echo "$p"; done | head -1)
  [ -z "$pid" ] && continue
  echo "$(date +%H:%M:%S) watchdog: no log for ${age}s, restarting the run (pid $pid)" >> chain/bot.log
  kill -TERM "$pid"; sleep 60
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid"
done
