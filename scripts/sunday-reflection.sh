#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/sunday-reflection.sh
# Weekly Sunday afternoon check-in — 3 targeted questions to Dad via iMessage.
#
# Registered as a daily 14:00 job in zazu-scheduler.js; the Sunday guard
# (DOW check) makes it a no-op Mon–Sat so the marker file overhead is zero.
#
# Questions are data-driven: pulls this week's completions + top stalled HIGH
# tasks from board-data.json and builds a concise message (no LLM, no tools —
# same reliable pattern as board-reminders.sh).
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG="$BOARD_DIR/logs/reflection.log"

source "$BOARD_DIR/scripts/lib/zazu-notify.sh"
if ! source ~/.zazu-config 2>/dev/null; then
  log_ts "ERROR: ~/.zazu-config not found — cannot load DAD_NUMBER" "$LOG"
  exit 1
fi

# ── Sunday guard ──────────────────────────────────────────────────────────────
DOW=$(date +%u)   # 1=Mon … 7=Sun
if [ "$DOW" != "7" ]; then
  log_ts "Not Sunday (DOW=$DOW) — skipping" "$LOG"
  exit 0
fi

log_ts "sunday-reflection.sh started" "$LOG"

DATE_LABEL=$(date "+%B %-d")

# ── Build message via node (board stats → formatted text) ─────────────────────
MSG=$(node -e "
const b = require('$BOARD_DIR/board-data.json');
const now = new Date();
const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

const doneThisWeek = b.tasks.filter(t =>
  t.stage === 'DONE' && t.completedAt && t.completedAt >= weekAgo
);

const openHigh = b.tasks
  .filter(t => t.stage !== 'DONE' && t.priority === 'HIGH')
  .sort((a, z) => (z.briefCount || 0) - (a.briefCount || 0))
  .slice(0, 3);

const highList = openHigh.length
  ? openHigh.map(t => '• ' + t.title.substring(0, 65)).join('\n')
  : '(no open HIGH tasks — strong week!)';

const doneStr = doneThisWeek.length === 0
  ? 'Nothing closed on the board this week.'
  : doneThisWeek.length === 1
    ? '1 task done this week: ' + doneThisWeek[0].title.substring(0, 55)
    : doneThisWeek.length + ' tasks closed this week.';

const msg = [
  'Zazu Sunday Check-In — $DATE_LABEL',
  '',
  'Q1: ' + doneStr + ' What else moved that was not on the board?',
  '',
  'Q2: Open HIGH items:',
  highList,
  'Which one deserves the most energy next week?',
  '',
  'Q3: Any feedback on Zazu this week — better briefings, fewer alerts, something missing?'
].join('\n');

process.stdout.write(msg);
") || {
  alert_failure "sunday-reflection.sh" "node failed to generate reflection message" "$LOG"
  exit 1
}

if [ -z "$MSG" ]; then
  alert_failure "sunday-reflection.sh" "generated reflection message was empty" "$LOG"
  exit 1
fi

log_ts "Sending Sunday reflection to Dad" "$LOG"
RESULT=$(send_imessage "$DAD_NUMBER" "$MSG")
check_imessage_result "$RESULT" "Sunday reflection to Dad" "$LOG"
log_ts "Sunday reflection sent OK" "$LOG"
