#!/bin/bash
# scripts/newsletter-scan.sh — launchd wrapper for the deterministic newsletter reader.
# Runs newsletter-scan.py (IMAP fetch + local-model extraction → Family calendar),
# then iMessages Dad ONLY when new events were added. Reliable; logs always.
set -uo pipefail
BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG="$BOARD_DIR/logs/newsletter-scan.log"
mkdir -p "$BOARD_DIR/logs"
# shellcheck source=/dev/null
source "$BOARD_DIR/scripts/lib/zazu-notify.sh" 2>/dev/null || true
source ~/.zazu-config 2>/dev/null || true

log_ts "newsletter-scan.sh started" "$LOG" 2>/dev/null || echo "[$(date -u +%FT%TZ)] started" >> "$LOG"
DIGEST=$(/usr/bin/env python3 "$BOARD_DIR/scripts/newsletter-scan.py" 2>>"$LOG")
printf '%s\n' "$DIGEST" >> "$LOG"

if printf '%s' "$DIGEST" | grep -q "Added "; then
  MSG="🏫 AJ / Primrose — new school events added to the Family calendar:
$DIGEST"
  if declare -f send_imessage >/dev/null 2>&1 && [ -n "${DAD_NUMBER:-}" ]; then
    send_imessage "$DAD_NUMBER" "$MSG" >> "$LOG" 2>&1 || log_ts "WARNING: newsletter iMessage send failed" "$LOG"
  fi
fi
log_ts "newsletter-scan.sh complete" "$LOG" 2>/dev/null || echo "[$(date -u +%FT%TZ)] complete" >> "$LOG"
