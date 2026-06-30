#!/bin/bash
# scripts/analytics-refresh.sh
#
# Runs nightly at 06:45 (before morning briefing) via zazu-scheduler.js.
# Regenerates analytics/outputs/ files so board-briefing.sh can read them.

export PATH="/Users/zazunyche/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/zazunyche"

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG="$BOARD_DIR/logs/analytics-refresh.log"

source "$BOARD_DIR/scripts/lib/zazu-notify.sh"

log_ts "analytics-refresh.sh started" "$LOG"

cd "$BOARD_DIR" || { log_ts "ERROR: could not cd to $BOARD_DIR" "$LOG"; exit 1; }

node analytics/scripts/board-health.js --save >> "$LOG" 2>&1
HC_EXIT=$?

node analytics/scripts/completion-rate.js --save >> "$LOG" 2>&1
CR_EXIT=$?

node analytics/scripts/lead-time-basic.js --save >> "$LOG" 2>&1
LT_EXIT=$?

node analytics/scripts/cycle-time.js --save >> "$LOG" 2>&1
CT_EXIT=$?

node analytics/scripts/stage-funnel.js --save >> "$LOG" 2>&1
SF_EXIT=$?

node analytics/scripts/dedup-detector.js --save >> "$LOG" 2>&1
DD_EXIT=$?

if [ $HC_EXIT -ne 0 ] || [ $CR_EXIT -ne 0 ] || [ $LT_EXIT -ne 0 ] || [ $CT_EXIT -ne 0 ] || [ $SF_EXIT -ne 0 ] || [ $DD_EXIT -ne 0 ]; then
  log_ts "analytics-refresh.sh: one or more scripts failed (board-health=$HC_EXIT completion-rate=$CR_EXIT lead-time-basic=$LT_EXIT cycle-time=$CT_EXIT stage-funnel=$SF_EXIT dedup-detector=$DD_EXIT)" "$LOG"
  exit 1
fi

log_ts "analytics-refresh.sh complete — outputs written to analytics/outputs/" "$LOG"
