#!/bin/bash
# scripts/aj-weekly.sh — weekly "AJ this week" digest wrapper.
# Runs aj-weekly.py (reads the week's ProCare daily summaries → local-model digest +
# rolling interests profile) and texts the digest to Dad + Mom. Reliable; logs always.
set -uo pipefail
BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG="$BOARD_DIR/logs/aj-weekly.log"; mkdir -p "$BOARD_DIR/logs"
# shellcheck source=/dev/null
source "$BOARD_DIR/scripts/lib/zazu-notify.sh" 2>/dev/null || true
source ~/.zazu-config 2>/dev/null || true

log_ts "aj-weekly.sh started" "$LOG" 2>/dev/null || echo "[$(date -u +%FT%TZ)] started" >> "$LOG"
OUT=$(/usr/bin/env python3 "$BOARD_DIR/scripts/aj-weekly.py" 2>>"$LOG")
printf '%s\n' "$OUT" >> "$LOG"
DIGEST=$(printf '%s\n' "$OUT" | sed -n '/===DIGEST===/,$p' | sed '1d')
if [ -n "$DIGEST" ] && declare -f send_imessage >/dev/null 2>&1; then
  for N in "${DAD_NUMBER:-}" "${MOM_NUMBER:-}"; do
    [ -n "$N" ] && { send_imessage "$N" "$DIGEST" >> "$LOG" 2>&1 || log_ts "WARNING: aj-weekly iMessage to $N failed" "$LOG"; }
  done
fi
log_ts "aj-weekly.sh complete" "$LOG" 2>/dev/null || echo "[$(date -u +%FT%TZ)] complete" >> "$LOG"
