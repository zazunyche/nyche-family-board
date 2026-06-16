#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/board-reminders.sh
# Called by com.zazu.board-reminders launchd job at 8:00am daily.
# Reads pending reminders from board-data.json and sends them via
# Zazu's iMessage channel. Marks each reminder as sent after delivery.
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

# ── Check if there are any reminders due today ────────────────────────────────
REMINDERS_JSON=$(node -e "
const fs = require('fs');
const b  = JSON.parse(fs.readFileSync('$BOARD_DIR/board-data.json', 'utf8'));
const due = (b.pendingReminders || []).filter(r => !r.sent && r.sendDate === '$TODAY');
console.log(JSON.stringify(due));
" 2>>"$LOG") || {
  alert_failure "board-reminders.sh" "Failed to read pending reminders from board-data.json" "$LOG"
  exit 1
}

REMINDER_COUNT=$(node -e "console.log(JSON.parse(process.argv[1]).length)" "$REMINDERS_JSON" 2>/dev/null || echo "0")

if [ "$REMINDER_COUNT" -eq 0 ]; then
  log_ts "No reminders due today" "$LOG"
  exit 0
fi

log_ts "$REMINDER_COUNT reminder(s) due today" "$LOG"

# ── Build prompt ──────────────────────────────────────────────────────────────
PROMPT="You are Zazu, the Nyche family's AI house manager. Today is $TODAY.

You have scheduled reminders to deliver right now via iMessage.

REMINDERS DUE TODAY:
$REMINDERS_JSON

For each reminder:
1. Send the message to the specified handle using your iMessage tools (mcp__plugin_imessage_imessage__*)
2. After sending successfully, mark it as sent by running:
   node $BOARD_DIR/board-tools/mark-reminded.js --reminder [id] --actor ZAZU

Send each reminder exactly as written in the 'message' field — these were pre-composed when the event was discovered. Do not paraphrase or expand them.

After all reminders are sent, confirm completion silently (no extra messages needed)."

# ── Invoke Claude (one-shot) ──────────────────────────────────────────────────
# Wait for iMessage plugin MCP handshake to complete
sleep 8

if ! /opt/homebrew/bin/claude \
  --channels plugin:imessage@claude-plugins-official \
  -p "$PROMPT" \
  --system-prompt ~/.claude/system-prompt.md \
  --dangerously-skip-permissions \
  >> "$LOG" 2>&1; then
  alert_failure "board-reminders.sh" "Claude invocation exited non-zero — reminders may not have been delivered ($REMINDER_COUNT due)" "$LOG"
  exit 1
fi

# ── Post-delivery validation ──────────────────────────────────────────────────
# Verify that mark-reminded.js was actually called for each reminder.
# If no reminders were marked, Claude likely failed to deliver them.
RECENT_LOG=$(tail -150 "$LOG" 2>/dev/null || echo "")

if ! echo "$RECENT_LOG" | grep -q "mark-reminded"; then
  alert_failure "board-reminders.sh" "Claude ran but log shows no mark-reminded.js calls — $REMINDER_COUNT reminder(s) may not have been delivered. Review: $LOG" "$LOG"
  exit 1
fi

log_ts "board-reminders.sh complete" "$LOG"
