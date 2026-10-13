#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/gmail-scan.sh  — DETERMINISTIC household email scanner (rebuilt 2026-10-13)
#
# Replaces the old version that spawned a headless `claude -p` session relying on
# the claude.ai Gmail MCP. That combo started every 2h but never COMPLETED (the
# MCP didn't register in the short headless session) — silent hang, no tasks/events
# ever created. Same failure class as the old blank morning briefs.
#
# Now a thin, reliable wrapper around scripts/email-scan.py:
#   IMAP fetch recent mail -> CODE pre-filters to household-relevant candidates ->
#   ONE batched LOCAL-model classification -> board tasks (add.js) + Apple "Family"
#   calendar events (osascript) -> iMessage Dad a digest ONLY when items were created.
# Deterministic, dedupes via ~/.zazu-email-processed.json, never hangs, always logs.
# (ProCare newsletters are handled separately by newsletter-scan.py.)
# Still invoked by zazu-scheduler.js on the existing GMAIL_TIMES cadence.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG="$BOARD_DIR/logs/gmail-scan.log"; mkdir -p "$BOARD_DIR/logs"
# shellcheck source=/dev/null
source "$BOARD_DIR/scripts/lib/zazu-notify.sh" 2>/dev/null || true
source ~/.zazu-config 2>/dev/null || true

log_ts "gmail-scan.sh (deterministic) started" "$LOG" 2>/dev/null || echo "[$(date -u +%FT%TZ)] started" >> "$LOG"
DIGEST=$(/usr/bin/env python3 "$BOARD_DIR/scripts/email-scan.py" 2>>"$LOG")
printf '%s\n' "$DIGEST" >> "$LOG"

if printf '%s' "$DIGEST" | grep -qE "created [1-9]"; then
  MSG="📬 Zazu processed new household email and added these to the board/calendar:
$DIGEST"
  if declare -f send_imessage >/dev/null 2>&1 && [ -n "${DAD_NUMBER:-}" ]; then
    send_imessage "$DAD_NUMBER" "$MSG" >> "$LOG" 2>&1 || log_ts "WARNING: gmail-scan iMessage send failed" "$LOG"
  fi
fi
log_ts "gmail-scan.sh (deterministic) complete" "$LOG" 2>/dev/null || echo "[$(date -u +%FT%TZ)] complete" >> "$LOG"
