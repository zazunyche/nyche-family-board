#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/board-briefing.sh
# Called by com.zazu.board-briefing launchd job at 7:00am daily.
# Sends iMessages to Dad + Mom, emails Dad's briefing via send-email.js,
# and updates board task state.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG_DIR="$BOARD_DIR/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/board-briefing.log"

# ── Load shared notify library ────────────────────────────────────────────────
# shellcheck source=scripts/lib/zazu-notify.sh
source "$BOARD_DIR/scripts/lib/zazu-notify.sh"

# ── Load contact config (never committed — lives in ~/.zazu-config) ───────────
# shellcheck source=/dev/null
if ! source ~/.zazu-config 2>/dev/null; then
  log_ts "ERROR: ~/.zazu-config not found or not sourceable" "$LOG"
  exit 1
fi

log_ts "board-briefing.sh started" "$LOG"

# ── Get board context ─────────────────────────────────────────────────────────
BOARD_CONTEXT=$(node "$BOARD_DIR/board-tools/zazu-context.js" 2>>"$LOG") || {
  alert_failure "board-briefing.sh" "zazu-context.js failed to produce board context" "$LOG"
  exit 1
}

if [ -z "$BOARD_CONTEXT" ]; then
  alert_failure "board-briefing.sh" "zazu-context.js returned empty output — board state unreadable" "$LOG"
  exit 1
fi

# ── Build prompt ──────────────────────────────────────────────────────────────
TODAY=$(date "+%A, %B %-d")

PROMPT="You are Zazu, the Nyche family's AI house manager. Today is $TODAY.

You have THREE tasks right now:

1. Send a morning household board briefing to Dad ($DAD_NUMBER) and Mom ($MOM_NUMBER) via iMessage.
2. Send an email copy of Dad's briefing to $DAD_EMAIL_WORK using send-email.js.
3. Update board task statuses after sending.

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

EMAIL TASK — after both iMessages are sent, use the Bash tool to email Dad's briefing:
  node /Users/zazunyche/Documents/src/family-board/scripts/send-email.js \\
    --to $DAD_EMAIL_WORK \\
    --subject \"Zazu Board Brief — $TODAY\" \\
    --body \"[plain text of the briefing you sent to Dad via iMessage]\"

BOARD UPDATE — after all messages are sent, use the board tools to:
- Increment briefCount on any overdue or stalled tasks you surfaced
- Update lastBriefed timestamp on those tasks

CRITICAL — iMessage delivery rules:
- Use ONLY the mcp__plugin_imessage_imessage__reply tool to send iMessages
- Dad chat_id: any;-;$DAD_NUMBER
- Mom chat_id: any;-;$MOM_NUMBER
- Do NOT use osascript, bash, or any other method to send iMessages
Use your board tools (node /Users/zazunyche/Documents/src/family-board/board-tools/...) to update task state after sending."

# ── Invoke Claude as Zazu (one-shot) ─────────────────────────────────────────
# Wait for iMessage plugin MCP handshake to complete
sleep 8

if ! /opt/homebrew/bin/claude \
  --channels plugin:imessage@claude-plugins-official \
  --system-prompt ~/.claude/system-prompt.md \
  --dangerously-skip-permissions \
  -p "$PROMPT" \
  >> "$LOG" 2>&1; then
  alert_failure "board-briefing.sh" "Claude invocation exited non-zero — briefing may not have been delivered" "$LOG"
  exit 1
fi

# ── Post-delivery validation ──────────────────────────────────────────────────
# Check that Claude's run left some evidence of sending (logged output should
# contain iMessage tool call references). We scan the last 100 lines of the log.
RECENT_LOG=$(tail -100 "$LOG" 2>/dev/null || echo "")
if ! echo "$RECENT_LOG" | grep -q "mcp__plugin_imessage"; then
  alert_failure "board-briefing.sh" "Claude ran but log shows no iMessage tool calls — briefing likely not delivered. Review: $LOG" "$LOG"
  # Non-zero exit so launchd records failure
  exit 1
fi

log_ts "board-briefing.sh complete" "$LOG"
