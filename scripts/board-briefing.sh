#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/board-briefing.sh
# Called by com.zazu.board-briefing launchd job at 7:00am daily.
# Sends iMessages to Dad + Mom, emails Dad's briefing via send-email.js.
#
# Rewritten 2026-06-22: previously spawned a fresh `claude -p --channels
# plugin:imessage` session and required it to send via the MCP tool only.
# That MCP connection frequently doesn't finish registering inside a
# short-lived headless session — confirmed root cause of repeated "no
# morning text" complaints. Composition (Claude, text-only, no tools/MCP)
# is now separated from delivery (direct osascript via send_imessage, the
# same proven path daily-learning.sh already uses reliably).
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

TODAY=$(date "+%A, %B %-d")

# ── Compose deterministically ────────────────────────────────────────────────
# Rewritten 2026-10-09: the headless `claude -p` composer was flaky (frequent
# empty/malformed output -> useless fallback) and could not guarantee a stable
# number->task-id mapping. compose-brief.js renders a NUMBERED list in code and
# persists logs/brief-index.json so replies like "2 done" resolve to the real id.
RAW=$(node "$BOARD_DIR/board-tools/compose-brief.js" 2>>"$LOG") || true

DAD_MSG=$(printf '%s\n' "$RAW" | sed -n '/===DAD===/,/===MOM===/p' | sed '1d;$d')
MOM_MSG=$(printf '%s\n' "$RAW" | sed -n '/===MOM===/,/===END===/p' | sed '1d;$d')

if [ -z "$DAD_MSG" ]; then
  log_ts "WARNING: Claude composition empty/malformed — using template fallback for Dad" "$LOG"
  DAD_MSG="Good morning! 🌅 $TODAY board brief.
(Auto-fallback — composition failed, check $LOG for board details.)
— Zazu"
fi
if [ -z "$MOM_MSG" ]; then
  log_ts "WARNING: Claude composition empty/malformed — using template fallback for Mom" "$LOG"
  MOM_MSG="Good morning! 🌅 $TODAY board brief.
(Auto-fallback — composition failed, check $LOG for board details.)
— Zazu"
fi

# ── Email copy of Dad's briefing (sent first — email is more reliable than iMessage) ─────────
if ! node "$BOARD_DIR/scripts/send-email.js" \
  --to "$DAD_EMAIL_WORK" \
  --subject "Zazu Board Brief — $TODAY" \
  --body "$DAD_MSG" >> "$LOG" 2>&1; then
  log_ts "WARNING: board briefing email failed to send" "$LOG"
fi

# ── Deliver via direct osascript (best-effort — failure logged but does not abort) ──────────
DAD_RESULT=$(send_imessage "$DAD_NUMBER" "$DAD_MSG") || true
check_imessage_result "$DAD_RESULT" "board briefing to Dad" "$LOG" || true

MOM_RESULT=$(send_imessage "$MOM_NUMBER" "$MOM_MSG") || true
check_imessage_result "$MOM_RESULT" "board briefing to Mom" "$LOG" || true

# ── Mark active tasks as briefed (enables resistanceScore detection) ───────────
if node "$BOARD_DIR/board-tools/mark-briefed.js" >> "$LOG" 2>&1; then
  log_ts "mark-briefed complete" "$LOG"
else
  log_ts "WARNING: mark-briefed.js failed — briefCount not updated" "$LOG"
fi

log_ts "board-briefing.sh complete" "$LOG"
