#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/board-briefing.sh
# Called by com.zazu.board-briefing launchd job at 7:00am daily.
# Follows the exact same pattern as ~/.claude/daily-briefing.sh.
#
# Reads board-data.json via zazu-context.js and injects it into a
# claude -p one-shot prompt. Claude (as Zazu) sends the briefing to
# Dad and Mom via her iMessage channel tools.
#
# NOTE: iMessages are sent by Claude using mcp__plugin_imessage_imessage__*
#       tools inside the -p invocation. This script never calls osascript.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BOARD_DIR="/Users/zazunyche/family-board"
LOG_DIR="$BOARD_DIR/logs"
mkdir -p "$LOG_DIR"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] board-briefing.sh started" >> "$LOG_DIR/board-briefing.log"

# ── Get board context ─────────────────────────────────────────────────────────
BOARD_CONTEXT=$(node "$BOARD_DIR/board-tools/zazu-context.js" 2>>"$LOG_DIR/board-briefing.log") || {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: zazu-context.js failed" >> "$LOG_DIR/board-briefing.log"
  exit 1
}

# ── Build prompt ──────────────────────────────────────────────────────────────
TODAY=$(date "+%A, %B %-d")
DAD_NUMBER="+16173353840"
MOM_NUMBER="+16175438839"

PROMPT="You are Zazu, the Nyche family's AI house manager. Today is $TODAY.

You have two tasks right now:

1. Send a morning household board briefing to Dad ($DAD_NUMBER) and Mom ($MOM_NUMBER) via iMessage.
2. After sending, update any task statuses that need it (e.g. increment briefCount on surfaced tasks using the board tools).

Here is the current household board state:

$BOARD_CONTEXT

BRIEFING RULES:
- Send TWO separate iMessages — one to Dad, one to Mom
- Personalise each: Dad gets his tasks, Mom gets hers. Both get household-wide urgent/stalled items.
- Lead with urgent/overdue items — these come first always
- Then stalled items (idle 7+ days)
- Then due this week
- Then their personal open task list
- Keep it scannable — short lines, light emoji, not a wall of text
- Sign off: '— Zazu'
- Active hours are 7am–10pm ET — this fires at 7am so you're good to send
- Do NOT include snoozed tasks in the briefing
- If the board is all clear (no overdue, no stalled), lead with that good news then give the week ahead

After sending both messages, run the board tools shown in the context to:
- Increment briefCount on any overdue or stalled tasks you surfaced
- Update lastBriefed timestamp on those tasks

Use your iMessage tools (mcp__plugin_imessage_imessage__*) to send. Use your board tools (node commands) to update task state."

# ── Invoke Claude as Zazu (one-shot, same pattern as daily-briefing.sh) ───────
claude -p "$PROMPT" \
  --system-prompt ~/.claude/system-prompt.md \
  --dangerously-skip-permissions \
  >> "$LOG_DIR/board-briefing.log" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] board-briefing.sh complete" >> "$LOG_DIR/board-briefing.log"
