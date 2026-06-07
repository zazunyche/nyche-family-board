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

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] board-reminders.sh started" >> "$LOG_DIR/board-reminders.log"

TODAY=$(date "+%Y-%m-%d")

# ── Check if there are any reminders due today ────────────────────────────────
REMINDERS_JSON=$(node -e "
const fs = require('fs');
const b  = JSON.parse(fs.readFileSync('$BOARD_DIR/board-data.json', 'utf8'));
const due = (b.pendingReminders || []).filter(r => !r.sent && r.sendDate === '$TODAY');
console.log(JSON.stringify(due));
" 2>>"$LOG_DIR/board-reminders.log")

REMINDER_COUNT=$(node -e "console.log(JSON.parse(process.argv[1]).length)" "$REMINDERS_JSON" 2>/dev/null || echo "0")

if [ "$REMINDER_COUNT" -eq 0 ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] No reminders due today" >> "$LOG_DIR/board-reminders.log"
  exit 0
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $REMINDER_COUNT reminder(s) due today" >> "$LOG_DIR/board-reminders.log"

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
claude -p "$PROMPT" \
  --system-prompt ~/.claude/system-prompt.md \
  --dangerously-skip-permissions \
  >> "$LOG_DIR/board-reminders.log" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] board-reminders.sh complete" >> "$LOG_DIR/board-reminders.log"
