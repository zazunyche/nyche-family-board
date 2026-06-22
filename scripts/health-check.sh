#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/health-check.sh
# On-demand or post-job health check for the Zazu system.
# Can be run manually or called by any launchd job after it completes.
#
# Checks:
#   1. Was today's learning snippet delivered?
#   2. Did the midnight commit run (since yesterday)?
#   3. Are there ERROR lines in today's logs?
#   4. Is the board server still responding?
#
# Sends iMessage alert to Dad if anything is stale or errored.
# Exits 0 if healthy, 1 if any issue found.
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail
# Note: no -e here — we want all checks to run before deciding to alert.

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG_DIR="$BOARD_DIR/logs"
mkdir -p "$LOG_DIR"

HEALTH_LOG="$LOG_DIR/health-check.log"

# ── Load shared notify library ────────────────────────────────────────────────
# shellcheck source=scripts/lib/zazu-notify.sh
source "$BOARD_DIR/scripts/lib/zazu-notify.sh"

# ── Load contact config (never committed — lives in ~/.zazu-config) ───────────
# shellcheck source=/dev/null
if ! source ~/.zazu-config 2>/dev/null; then
  log_ts "ERROR: ~/.zazu-config not found — health check cannot send iMessage alerts" "$HEALTH_LOG"
  # Continue checks but alerts won't go through
fi

TODAY=$(date "+%Y-%m-%d")
ISSUES=()

log_ts "health-check.sh started" "$HEALTH_LOG"

# ── 1. Was today's learning snippet delivered? ────────────────────────────────
CURRICULUM_JSON="$BOARD_DIR/learning/curriculum.json"
if [ -f "$CURRICULUM_JSON" ]; then
  LAST_DELIVERED=$(node -e "
    const d=JSON.parse(require('fs').readFileSync('$CURRICULUM_JSON'));
    console.log(d.progress.last_delivered_date || '');
  " 2>/dev/null || echo "")

  if [ "$LAST_DELIVERED" = "$TODAY" ]; then
    log_ts "CHECK PASS: Learning snippet delivered today ($TODAY)" "$HEALTH_LOG"
  else
    # Only flag this during the window when delivery should have happened (after 9am ET)
    CURRENT_HOUR=$(date "+%H")
    if [ "$CURRENT_HOUR" -ge 9 ]; then
      MSG="Learning snippet NOT delivered today (last: ${LAST_DELIVERED:-never})"
      log_ts "CHECK FAIL: $MSG" "$HEALTH_LOG"
      ISSUES+=("$MSG")
    else
      log_ts "CHECK SKIP: Learning snippet check skipped (before 9am)" "$HEALTH_LOG"
    fi
  fi
else
  MSG="curriculum.json not found at $CURRICULUM_JSON"
  log_ts "CHECK FAIL: $MSG" "$HEALTH_LOG"
  ISSUES+=("$MSG")
fi

# ── 2. Did the midnight commit run since yesterday? ────────────────────────────
# We check for a git commit newer than yesterday midnight.
# If there were no changes, that's fine — we check the git.log for evidence the
# script ran at all (either a "Committed" or "No tracked changes" line today).
GIT_LOG="$LOG_DIR/git.log"
if [ -f "$GIT_LOG" ]; then
  YESTERDAY=$(date -v-1d "+%Y-%m-%d" 2>/dev/null || date -d "yesterday" "+%Y-%m-%d" 2>/dev/null || echo "")
  if grep -q "$TODAY\|$YESTERDAY" "$GIT_LOG" 2>/dev/null; then
    log_ts "CHECK PASS: midnight-commit.sh ran recently (found today/yesterday entry in git.log)" "$HEALTH_LOG"
  else
    CURRENT_HOUR=$(date "+%H")
    if [ "$CURRENT_HOUR" -ge 1 ]; then
      MSG="midnight-commit.sh may not have run — no entry for $TODAY in git.log"
      log_ts "CHECK FAIL: $MSG" "$HEALTH_LOG"
      ISSUES+=("$MSG")
    fi
  fi
else
  MSG="git.log not found — midnight-commit.sh may never have run"
  log_ts "CHECK WARN: $MSG" "$HEALTH_LOG"
  ISSUES+=("$MSG")
fi

# ── 3. ERROR lines in today's logs ────────────────────────────────────────────
LOG_FILES=(
  "$LOG_DIR/daily-learning.log"
  "$LOG_DIR/board-briefing.log"
  "$LOG_DIR/board-reminders.log"
  "$LOG_DIR/gmail-scan.log"
  "$LOG_DIR/git.log"
  "$LOG_DIR/daily-briefing.log"
)

for logfile in "${LOG_FILES[@]}"; do
  if [ ! -f "$logfile" ]; then
    continue
  fi
  # Search for ERROR lines dated today
  ERROR_LINES=$(grep -c "\[$TODAY" "$logfile" 2>/dev/null | head -1 || echo "0")
  TODAY_ERRORS=$(grep "\[$TODAY" "$logfile" 2>/dev/null | grep " ERROR:" || true)
  if [ -n "$TODAY_ERRORS" ]; then
    COUNT=$(echo "$TODAY_ERRORS" | wc -l | tr -d ' ')
    BASENAME=$(basename "$logfile")
    MSG="$COUNT ERROR(s) in $BASENAME today"
    log_ts "CHECK FAIL: $MSG" "$HEALTH_LOG"
    ISSUES+=("$MSG")
    # Log first error line for context
    FIRST_ERROR=$(echo "$TODAY_ERRORS" | head -1)
    log_ts "  First error: $FIRST_ERROR" "$HEALTH_LOG"
  fi
done

if [ ${#ISSUES[@]} -eq 0 ] || ! (printf '%s\n' "${ISSUES[@]}" | grep -q "ERROR"); then
  log_ts "CHECK PASS: No ERROR lines found in today's logs" "$HEALTH_LOG"
fi

# ── 4. Board server responding ────────────────────────────────────────────────
if curl -sf --max-time 5 http://localhost:3000/ > /dev/null 2>&1; then
  log_ts "CHECK PASS: Board server responding on localhost:3000" "$HEALTH_LOG"
else
  MSG="Board server not responding on localhost:3000"
  log_ts "CHECK FAIL: $MSG" "$HEALTH_LOG"
  ISSUES+=("$MSG")
fi

# ── 5. Missed-trigger check: did today's scheduled jobs actually complete? ────
# Checks for a "complete" log line dated today, not just absence of ERROR —
# catches jobs that were killed before logging anything at all (e.g. EINTR'd
# before the script even started), which checks 1-3 above wouldn't see.
CURRENT_HOUR=$(date "+%H")
# Parallel arrays instead of an associative array — stock macOS /bin/bash is
# 3.2 (no bash 4+ declare -A support).
EXPECTED_LOGS=("daily-briefing.log" "board-briefing.log" "board-reminders.log")
EXPECTED_HOURS=(7 7 8)
for idx in "${!EXPECTED_LOGS[@]}"; do
  logfile="${EXPECTED_LOGS[$idx]}"
  DUE_HOUR="${EXPECTED_HOURS[$idx]}"
  FULL_LOG="$LOG_DIR/$logfile"
  if [ "$CURRENT_HOUR" -lt "$DUE_HOUR" ]; then
    continue   # not due yet today
  fi
  if [ -f "$FULL_LOG" ] && grep -q "\[$TODAY.*complete\|\[$TODAY.*No reminders due" "$FULL_LOG" 2>/dev/null; then
    log_ts "CHECK PASS: $logfile shows a completed run today" "$HEALTH_LOG"
  else
    MSG="$logfile has no completed run today — job may have been killed before it could log anything (missed trigger)"
    log_ts "CHECK FAIL: $MSG" "$HEALTH_LOG"
    ISSUES+=("$MSG")
  fi
done

# ── Summary and alert ─────────────────────────────────────────────────────────
ISSUE_COUNT=${#ISSUES[@]}

if [ "$ISSUE_COUNT" -eq 0 ]; then
  log_ts "health-check.sh complete — all checks passed" "$HEALTH_LOG"
  exit 0
fi

# Build alert message
ALERT_BODY="Zazu health-check found $ISSUE_COUNT issue(s) on $TODAY:"
for issue in "${ISSUES[@]}"; do
  ALERT_BODY="$ALERT_BODY
• $issue"
done
ALERT_BODY="$ALERT_BODY
Check logs: $LOG_DIR/"

log_ts "Sending health alert: $ISSUE_COUNT issue(s)" "$HEALTH_LOG"

# Send iMessage to Dad (use send_imessage directly — not alert_failure — to avoid
# the "script name" framing since this is a health summary, not a single failure)
ALERT_RESULT=$(send_imessage "$DAD_NUMBER" "$ALERT_BODY" 2>&1) || true
if [[ "$ALERT_RESULT" == *"sent"* ]]; then
  log_ts "Health alert delivered to Dad via iMessage" "$HEALTH_LOG"
else
  log_ts "WARNING: Could not deliver health alert via iMessage: $ALERT_RESULT" "$HEALTH_LOG"
fi

log_ts "health-check.sh complete — $ISSUE_COUNT issue(s) found" "$HEALTH_LOG"
exit 1
