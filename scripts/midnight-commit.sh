#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/midnight-commit.sh
# Called by com.zazu.board-midnight-commit launchd job at 12:00am daily.
# Commits board-data.json to git if there are changes.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG_DIR="$BOARD_DIR/logs"
mkdir -p "$LOG_DIR"

DATE=$(date "+%Y-%m-%d")
LOG="$LOG_DIR/git.log"

cd "$BOARD_DIR"

if ! git diff --quiet board-data.json 2>/dev/null; then
  git add board-data.json
  git commit -m "daily snapshot $DATE" >> "$LOG" 2>&1
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Committed board-data.json for $DATE" >> "$LOG"
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] No changes to commit for $DATE" >> "$LOG"
fi
