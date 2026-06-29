#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/board-reminders.sh
# Called by com.zazu.board-reminders launchd job at 8:00am daily.
# Reads pending reminders from board-data.json and sends them via
# osascript, then marks each as sent.
#
# Rewritten 2026-06-22: previously spawned a fresh `claude -p --channels
# plugin:imessage` session and required it to use the MCP tool to send each
# reminder. Same fragile pattern as the morning briefings — the MCP
# connection frequently doesn't finish registering inside a short-lived
# headless session, so reminders could silently never go out. There's no
# reason for this script to involve an LLM at all: reminder messages are
# already pre-composed text sitting in board-data.json. This is now pure
# bash + node + osascript — nothing to hang on, nothing to misfire.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG_DIR="$BOARD_DIR/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/board-reminders.log"

# ── Load shared notify library ────────────────────────────────────────────────
# shellcheck source=scripts/lib/zazu-notify.sh
source "$BOARD_DIR/scripts/lib/zazu-notify.sh"

# ── Load contact config (never committed — lives in ~/.zazu-config) ───────────
# shellcheck source=/dev/null
if ! source ~/.zazu-config 2>/dev/null; then
  log_ts "ERROR: ~/.zazu-config not found or not sourceable" "$LOG"
  exit 1
fi

log_ts "board-reminders.sh started" "$LOG"

TODAY=$(date "+%Y-%m-%d")

# ── Pull due reminders into a JSONL temp file (id|handle|base64 message) ──────
# NOTE: macOS mktemp requires X's at the very END of the template.
# Using /tmp/zazu-remindersXXXXXX (no extension) to avoid macOS mktemp bug
# where /tmp/prefix-XXXXXX.jsonl creates the literal filename (X's not expanded).
REMINDERS_FILE=$(mktemp /tmp/zazu-remindersXXXXXX)
# Ensure temp file is always cleaned up even if the script crashes or is killed
trap 'rm -f "$REMINDERS_FILE"' EXIT
REMINDER_COUNT=$(node -e "
const fs = require('fs');
const b  = JSON.parse(fs.readFileSync('$BOARD_DIR/board-data.json', 'utf8'));
const due = (b.pendingReminders || []).filter(r => !r.sent && r.sendDate === '$TODAY');
const lines = due.map(r => JSON.stringify({
  id: r.id,
  handle: r.handle,
  message: Buffer.from(r.message, 'utf8').toString('base64')
}));
fs.writeFileSync('$REMINDERS_FILE', lines.join('\n') + (lines.length ? '\n' : ''));
console.log(due.length);
" 2>>"$LOG") || {
  alert_failure "board-reminders.sh" "Failed to read pending reminders from board-data.json" "$LOG"
  rm -f "$REMINDERS_FILE"
  exit 1
}

if [ "$REMINDER_COUNT" -eq 0 ]; then
  log_ts "No reminders due today" "$LOG"
  rm -f "$REMINDERS_FILE"
  exit 0
fi

log_ts "$REMINDER_COUNT reminder(s) due today" "$LOG"

FAIL_COUNT=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  RID=$(node -e "console.log(JSON.parse(process.argv[1]).id)" "$line")
  HANDLE=$(node -e "console.log(JSON.parse(process.argv[1]).handle)" "$line")
  MSG=$(node -e "console.log(JSON.parse(process.argv[1]).message)" "$line" | base64 -d)

  RESULT=$(send_imessage "$HANDLE" "$MSG")
  if [[ "$RESULT" == *"sent"* ]]; then
    node "$BOARD_DIR/board-tools/mark-reminded.js" --reminder "$RID" --actor ZAZU >> "$LOG" 2>&1
    log_ts "Reminder $RID sent to $HANDLE and marked" "$LOG"
  elif [[ "$RESULT" == *"ambiguous-1712"* ]]; then
    # -1712 = AppleEvent confirmation timed out. Message was probably delivered.
    # Mark as sent to prevent re-sending tomorrow; log a warning not an error.
    node "$BOARD_DIR/board-tools/mark-reminded.js" --reminder "$RID" --actor ZAZU >> "$LOG" 2>&1
    log_ts "WARNING: Reminder $RID send confirmation ambiguous (-1712) — marked sent to prevent duplicate" "$LOG"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    log_ts "ERROR: Reminder $RID failed to send to $HANDLE: $RESULT" "$LOG"
  fi
done < "$REMINDERS_FILE"

rm -f "$REMINDERS_FILE"

if [ "$FAIL_COUNT" -gt 0 ]; then
  alert_failure "board-reminders.sh" "$FAIL_COUNT of $REMINDER_COUNT reminder(s) failed to send" "$LOG"
  exit 1
fi

log_ts "board-reminders.sh complete" "$LOG"
