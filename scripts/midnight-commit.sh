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

# Stage all tracked-file changes (board-data.json is gitignored — never committed)
git add -u

# Also stage any new untracked files that aren't gitignored
git add . 2>/dev/null || true

if ! git diff --cached --quiet; then
  git commit -m "nightly sync $DATE" >> "$LOG" 2>&1
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Committed changes for $DATE" >> "$LOG"

  # Push so GitHub Pages stays current
  if git push origin main >> "$LOG" 2>&1; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Pushed to GitHub" >> "$LOG"
  else
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] WARNING: git push failed — check credentials" >> "$LOG"
  fi
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] No tracked changes to commit for $DATE" >> "$LOG"
fi
