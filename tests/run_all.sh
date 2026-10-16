#!/usr/bin/env bash
# run_all.sh - [Claude 2026-10-16] every tests/*_test.js at once, one per core (the operator: "please make the tests take less time").
# The files are independent node scripts, so running them side by side cuts the wall time to roughly the slowest one.
#   tests/run_all.sh              all of them
#   tests/run_all.sh dragon net   only files whose name contains one of the words
#   JOBS=4 tests/run_all.sh       cap the parallelism (default: number of cores)
# Logs land in /tmp/ashvale-tests/<name>.log; the summary lists each file's time and result, failures last.
set -u
cd "$(dirname "$0")/.."
OUT=${OUT:-/tmp/ashvale-tests}; JOBS=${JOBS:-$(nproc)}
mkdir -p "$OUT"; rm -f "$OUT"/*.log "$OUT"/*.res
files=$(ls tests/*_test.js)
if [ $# -gt 0 ]; then pat=$(printf '%s|' "$@"); files=$(printf '%s\n' $files | grep -E "${pat%|}"); fi
start=$(date +%s)
printf '%s\n' $files | xargs -P "$JOBS" -I{} bash -c '
  f={}; n=$(basename "$f" .js); s=$(date +%s.%N)
  node "$f" > "'"$OUT"'/$n.log" 2>&1; rc=$?
  printf "%7.1fs  %s  %s\n" "$(echo "$(date +%s.%N) - $s" | bc)" "$([ $rc = 0 ] && echo ok || echo FAIL)" "$n" > "'"$OUT"'/$n.res"'
cat "$OUT"/*.res | sort -k2,2r -k1,1n
fails=$(grep -l FAIL "$OUT"/*.res 2>/dev/null | wc -l)
echo "---- $(ls "$OUT"/*.res | wc -l) files, $fails failed, $(( $(date +%s) - start ))s wall. Failure lines:"
for r in $(grep -l FAIL "$OUT"/*.res 2>/dev/null); do n=$(basename "$r" .res); grep -E '^FAIL|Error' "$OUT/$n.log" | head -3 | sed "s/^/  $n: /" | cut -c1-200; done
[ "$fails" = 0 ]
