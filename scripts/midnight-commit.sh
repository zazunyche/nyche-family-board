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

# Refresh the sanitized Hermes config snapshot so config drift is tracked nightly.
if [ -x "$BOARD_DIR/infra/hermes/snapshot-hermes-config.sh" ]; then
  "$BOARD_DIR/infra/hermes/snapshot-hermes-config.sh" >> "$LOG" 2>&1 || log_ts "WARNING: hermes config snapshot failed" "$LOG"
fi

# ── Regression gate ───────────────────────────────────────────────────────────
# Run every unit suite before committing. These guard the analytics/board scripts
# staged just below (stage-funnel, wait-ratio, auto-close-events, mark-briefed,
# email-scan). Without this the suites were write-only — run once at authoring
# time, then never again — so a regression in a staged script would commit
# silently. A failure here is ALERTED but NON-fatal: we still commit so source
# backups keep flowing — a known-and-alerted failing test beats a missed nightly
# backup. Same alert-don't-block posture as the push-failure path below.
if [ -x "$BOARD_DIR/scripts/run-tests.sh" ]; then
  if bash "$BOARD_DIR/scripts/run-tests.sh" >> "$LOG" 2>&1; then
    log_ts "run-tests.sh: all unit suites green" "$LOG"
  else
    alert_failure "midnight-commit.sh" "unit test suite FAILED — a tracked script has a regression. See logs/git.log; re-run: bash scripts/run-tests.sh" "$LOG"
    # Intentional: do not exit 1 — continue so backups are not blocked.
  fi
else
  log_ts "WARNING: scripts/run-tests.sh missing or not executable — regression gate skipped" "$LOG"
fi

# Stage only already-tracked file changes (respects .gitignore; never picks up new untracked files)
# DO NOT use 'git add .' here — it would commit any untracked file not in .gitignore
git add -u

# Also stage newly-generated / newly-authored source files. `git add -u` above
# only re-stages ALREADY-tracked files, so any brand-new file accumulates
# uncommitted and unbacked-up until someone notices. This bit us repeatedly:
#   - learning/snippets/: daily-learning.sh writes a new pair every day (days
#     15+ were silently never committed).
#   - docs/proposals/: proposals 01 & 03 sat unbacked-up on local disk from
#     Jul 23 onward; analytics/scripts/staleness-triage.js and the run-*.sh
#     scripts fell through the same way.
# These are the source directories that hold committable content. A scoped
# `git add <dir>/` STILL RESPECTS .gitignore (so finance *.db, hermes queues,
# *.local.json, .env, board-data.json, logs/, guides/ etc. remain excluded),
# giving us the junk-safety of a whitelist without a bare `git add .`. Add a
# directory here when a new source tree is introduced.
git add learning/snippets/ analytics/ docs/ scripts/ board-tools/

# Safety net: the whitelist above only backs up directories we remembered to
# list. If a new source tree appears outside it, surface that within a day
# instead of discovering months of un-backed-up files later. This logs (does not
# commit) any remaining untracked, non-ignored files so the gap is visible.
UNTRACKED_LEFT=$(git ls-files --others --exclude-standard)
if [ -n "$UNTRACKED_LEFT" ]; then
  log_ts "WARNING: untracked non-ignored files NOT backed up (add their dir to midnight-commit.sh): $(echo "$UNTRACKED_LEFT" | tr '\n' ' ')" "$LOG"
fi

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
