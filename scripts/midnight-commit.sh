#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/midnight-commit.sh
# Called by com.zazu.board-midnight-commit launchd job at 12:00am daily.
# Commits board-data.json to git if there are changes, then pushes.
# Alerts Dad via iMessage if commit or push fails.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG_DIR="$BOARD_DIR/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/git.log"

# ── Load shared notify library ────────────────────────────────────────────────
# shellcheck source=scripts/lib/zazu-notify.sh
source "$BOARD_DIR/scripts/lib/zazu-notify.sh"

# ── Load contact config (never committed — lives in ~/.zazu-config) ───────────
# shellcheck source=/dev/null
if ! source ~/.zazu-config 2>/dev/null; then
  log_ts "ERROR: ~/.zazu-config not found — will commit but cannot send iMessage alerts" "$LOG"
  # Non-fatal: we can still do the commit without DAD_NUMBER
fi

DATE=$(date "+%Y-%m-%d")
log_ts "midnight-commit.sh started" "$LOG"

cd "$BOARD_DIR"

# Stage only already-tracked file changes (respects .gitignore; never picks up new untracked files)
# DO NOT use 'git add .' here — it would commit any untracked file not in .gitignore
git add -u

if ! git diff --cached --quiet; then
  if git commit -m "nightly sync $DATE" >> "$LOG" 2>&1; then
    log_ts "Committed changes for $DATE" "$LOG"
  else
    alert_failure "midnight-commit.sh" "git commit failed for $DATE" "$LOG"
    exit 1
  fi

  # Push so GitHub Pages stays current
  if git push origin main >> "$LOG" 2>&1; then
    log_ts "Pushed to GitHub" "$LOG"
  else
    # Push failure is serious but not catastrophic — local commit succeeded.
    # Alert rather than exit 1 so the next night's run still attempts a push.
    alert_failure "midnight-commit.sh" "git push failed for $DATE — local commit exists but GitHub Pages is stale. Check credentials." "$LOG"
    # Intentional: do not exit 1 here so launchd doesn't mark job as failed
    # when the local data is safe. The alert ensures it won't be silently missed.
  fi
else
  log_ts "No tracked changes to commit for $DATE" "$LOG"
fi

log_ts "midnight-commit.sh complete" "$LOG"
