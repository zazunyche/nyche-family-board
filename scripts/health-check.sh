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
#   5. Did today's scheduled jobs complete?
#
# Behavior (req_006): fix auto-fixable issues first; only iMessage Dad for
# issues that require human attention.
#
# Exits 0 if healthy or all issues were auto-fixed, 1 if escalation required.
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
FIXED_ISSUES=()      # issues that were auto-resolved — no human needed
ESCALATE_ISSUES=()   # issues that need human attention

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
    CURRENT_HOUR=$(date "+%H")
    if [ "$CURRENT_HOUR" -ge 9 ]; then
      MSG="Learning snippet NOT delivered today (last: ${LAST_DELIVERED:-never})"
      log_ts "CHECK FAIL: $MSG — attempting auto-fix" "$HEALTH_LOG"
      if bash "$BOARD_DIR/scripts/daily-learning.sh" >> "$LOG_DIR/daily-learning.log" 2>&1; then
        log_ts "AUTO-FIX: Learning snippet delivered by health-check retry" "$HEALTH_LOG"
        FIXED_ISSUES+=("Learning snippet: auto-delivered (was missed)")
      else
        log_ts "AUTO-FIX FAILED: daily-learning.sh retry failed" "$HEALTH_LOG"
        ESCALATE_ISSUES+=("$MSG — retry failed, manual check needed")
      fi
    else
      log_ts "CHECK SKIP: Learning snippet check skipped (before 9am)" "$HEALTH_LOG"
    fi
  fi
else
  MSG="curriculum.json not found at $CURRICULUM_JSON"
  log_ts "CHECK FAIL: $MSG" "$HEALTH_LOG"
  ESCALATE_ISSUES+=("$MSG")
fi

# ── 2. Did the midnight commit run since yesterday? ────────────────────────────
GIT_LOG="$LOG_DIR/git.log"
if [ -f "$GIT_LOG" ]; then
  YESTERDAY=$(date -v-1d "+%Y-%m-%d" 2>/dev/null || date -d "yesterday" "+%Y-%m-%d" 2>/dev/null || echo "")
  if grep -q "$TODAY\|$YESTERDAY" "$GIT_LOG" 2>/dev/null; then
    log_ts "CHECK PASS: midnight-commit.sh ran recently (found today/yesterday entry in git.log)" "$HEALTH_LOG"
  else
    CURRENT_HOUR=$(date "+%H")
    if [ "$CURRENT_HOUR" -ge 1 ]; then
      MSG="midnight-commit.sh may not have run — no entry for $TODAY in git.log"
      log_ts "CHECK FAIL: $MSG — attempting auto-fix" "$HEALTH_LOG"
      if bash "$BOARD_DIR/scripts/midnight-commit.sh" >> "$GIT_LOG" 2>&1; then
        log_ts "AUTO-FIX: midnight-commit.sh ran successfully" "$HEALTH_LOG"
        FIXED_ISSUES+=("midnight-commit: triggered now (was missed)")
      else
        log_ts "AUTO-FIX FAILED: midnight-commit.sh failed" "$HEALTH_LOG"
        ESCALATE_ISSUES+=("$MSG — auto-retry also failed")
      fi
    fi
  fi
else
  MSG="git.log not found — midnight-commit.sh may never have run"
  log_ts "CHECK WARN: $MSG" "$HEALTH_LOG"
  ESCALATE_ISSUES+=("$MSG")
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

HAS_ERRORS=false
for logfile in "${LOG_FILES[@]}"; do
  if [ ! -f "$logfile" ]; then
    continue
  fi
  TODAY_ERRORS=$(grep "\[$TODAY" "$logfile" 2>/dev/null | grep " ERROR:" || true)
  if [ -n "$TODAY_ERRORS" ]; then
    HAS_ERRORS=true
    COUNT=$(echo "$TODAY_ERRORS" | wc -l | tr -d ' ')
    BASENAME=$(basename "$logfile")
    MSG="$COUNT ERROR(s) in $BASENAME today"
    log_ts "CHECK FAIL: $MSG" "$HEALTH_LOG"
    ESCALATE_ISSUES+=("$MSG")
    FIRST_ERROR=$(echo "$TODAY_ERRORS" | head -1)
    log_ts "  First error: $FIRST_ERROR" "$HEALTH_LOG"
  fi
done

if [ "$HAS_ERRORS" = "false" ]; then
  log_ts "CHECK PASS: No ERROR lines found in today's logs" "$HEALTH_LOG"
fi

# ── 4. Board server responding ────────────────────────────────────────────────
if curl -sf --max-time 5 http://localhost:3000/ > /dev/null 2>&1; then
  log_ts "CHECK PASS: Board server responding on localhost:3000" "$HEALTH_LOG"
else
  MSG="Board server not responding on localhost:3000"
  log_ts "CHECK FAIL: $MSG — attempting restart" "$HEALTH_LOG"
  pkill -f "node server.js" 2>/dev/null || true
  sleep 1
  nohup node "$BOARD_DIR/server.js" >> "$LOG_DIR/server.log" 2>&1 &
  sleep 4
  if curl -sf --max-time 5 http://localhost:3000/ > /dev/null 2>&1; then
    log_ts "AUTO-FIX: Board server restarted and responding" "$HEALTH_LOG"
    FIXED_ISSUES+=("Board server: restarted and responding")
  else
    log_ts "AUTO-FIX FAILED: Board server still not responding after restart attempt" "$HEALTH_LOG"
    ESCALATE_ISSUES+=("$MSG — restart attempted but still down")
  fi
fi

# ── 5. Missed-trigger check: did today's scheduled jobs actually complete? ────
CURRENT_HOUR=$(date "+%H")
# board-reminders.sh is safe to re-run anytime (idempotent, time-gated internally).
# daily-briefing.sh and board-briefing.sh are morning-only — don't re-send at night.
EXPECTED_LOGS=("daily-briefing.log" "board-briefing.log" "board-reminders.log")
EXPECTED_HOURS=(7 7 8)
RETRIABLE=("false" "false" "true")
RETRY_SCRIPTS=("" "" "board-reminders.sh")

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
    MSG="$logfile has no completed run today — job may have been killed (missed trigger)"
    log_ts "CHECK FAIL: $MSG" "$HEALTH_LOG"
    if [ "${RETRIABLE[$idx]}" = "true" ] && [ -n "${RETRY_SCRIPTS[$idx]}" ]; then
      RETRY_SCRIPT="${RETRY_SCRIPTS[$idx]}"
      log_ts "AUTO-FIX: Retrying $RETRY_SCRIPT" "$HEALTH_LOG"
      if bash "$BOARD_DIR/scripts/$RETRY_SCRIPT" >> "$FULL_LOG" 2>&1; then
        log_ts "AUTO-FIX: $RETRY_SCRIPT re-ran successfully" "$HEALTH_LOG"
        FIXED_ISSUES+=("$logfile: re-ran $RETRY_SCRIPT (was missed)")
      else
        log_ts "AUTO-FIX FAILED: $RETRY_SCRIPT retry failed" "$HEALTH_LOG"
        ESCALATE_ISSUES+=("$MSG — retry also failed")
      fi
    else
      ESCALATE_ISSUES+=("$MSG")
    fi
  fi
done

# ── 6. Zazu iMessage session (claude-imessage tmux) ──────────────────────────
# If the tmux session is gone, Zazu is completely offline (not just degraded).
# launchd's KeepAlive=true should auto-restart it, but repeated auth failures
# can put it into a crash-restart loop where it never stays up. We alert so
# Dad knows to run /login remotely (via Tailscale) rather than discovering
# the outage by noticing Zazu went silent.
ZAZU_SESSION="claude-imessage"
if /opt/homebrew/bin/tmux has-session -t "$ZAZU_SESSION" 2>/dev/null; then
  log_ts "CHECK PASS: claude-imessage tmux session is running" "$HEALTH_LOG"
  # Secondary: check stderr log for auth/login errors in the last 30 minutes
  ZAZU_STDERR="/tmp/zazu.stderr.log"
  if [ -f "$ZAZU_STDERR" ]; then
    RECENT_AUTH_ERR=$(find "$ZAZU_STDERR" -newer /tmp -prune -o -print 2>/dev/null; \
      awk -v cutoff="$(date -v-30M +%s 2>/dev/null || date -d '30 minutes ago' +%s 2>/dev/null || echo 0)" \
      'BEGIN{found=0} /not logged in|login required|authentication|Unauthorized|401/{found=1} END{print found}' \
      "$ZAZU_STDERR" 2>/dev/null || echo "0")
    if [ "$RECENT_AUTH_ERR" = "1" ]; then
      MSG="Zazu session running but auth errors detected in stderr — may need /login soon"
      log_ts "CHECK WARN: $MSG" "$HEALTH_LOG"
      ESCALATE_ISSUES+=("$MSG")
    fi
  fi
else
  MSG="claude-imessage tmux session is NOT running — Zazu is completely offline"
  log_ts "CHECK FAIL: $MSG" "$HEALTH_LOG"
  log_ts "  launchd KeepAlive should restart it; if this alert repeats, SSH in and run: claude login" "$HEALTH_LOG"
  ESCALATE_ISSUES+=("$MSG — launchd should auto-restart within seconds; if this alert repeats, SSH in and run 'claude login'")
fi

# ── Summary and alert ─────────────────────────────────────────────────────────
FIXED_COUNT=${#FIXED_ISSUES[@]}
ESCALATE_COUNT=${#ESCALATE_ISSUES[@]}

if [ "$ESCALATE_COUNT" -eq 0 ] && [ "$FIXED_COUNT" -eq 0 ]; then
  log_ts "health-check.sh complete — all checks passed" "$HEALTH_LOG"
  exit 0
fi

if [ "$ESCALATE_COUNT" -eq 0 ]; then
  log_ts "health-check.sh: $FIXED_COUNT issue(s) auto-fixed — no human action needed" "$HEALTH_LOG"
  exit 0
fi

# Build alert — list only escalations; mention auto-fixes at bottom
ALERT_BODY="Zazu health-check: $ESCALATE_COUNT issue(s) need your attention ($TODAY):"
for issue in "${ESCALATE_ISSUES[@]}"; do
  ALERT_BODY="$ALERT_BODY
• $issue"
done
if [ "$FIXED_COUNT" -gt 0 ]; then
  ALERT_BODY="$ALERT_BODY

Auto-fixed ($FIXED_COUNT):"
  for fixed in "${FIXED_ISSUES[@]}"; do
    ALERT_BODY="$ALERT_BODY
✓ $fixed"
  done
fi
ALERT_BODY="$ALERT_BODY
Logs: $LOG_DIR/"

log_ts "Sending health alert: $ESCALATE_COUNT escalation(s), $FIXED_COUNT auto-fixed" "$HEALTH_LOG"

ALERT_RESULT=$(send_imessage "$DAD_NUMBER" "$ALERT_BODY" 2>&1) || true
if [[ "$ALERT_RESULT" == *"sent"* ]]; then
  log_ts "Health alert delivered to Dad via iMessage" "$HEALTH_LOG"
else
  log_ts "WARNING: Could not deliver health alert via iMessage: $ALERT_RESULT" "$HEALTH_LOG"
fi

log_ts "health-check.sh complete — $ESCALATE_COUNT escalation(s), $FIXED_COUNT auto-fixed" "$HEALTH_LOG"
exit 1
