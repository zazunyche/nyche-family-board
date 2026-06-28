#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/priority-escalation.sh
#
# Runs nightly (added to scheduler at 00:30, after midnight-commit).
#
# Implements dynamic priority escalation per analytics plan v1.2:
#   - Task with dueDate PAST (days < 0)                          → flag OVERDUE; iMessage Dad once/day
#   - Task with dueDate within 14 days AND priority MEDIUM or LOW → escalate one level
#   - Task with dueDate within  3 days AND priority not HIGH       → escalate to HIGH
#   - Task with dueDate within  1 day (days 0–1)                 → flag URGENT in log
#   - Task briefed 3+ times with no stage movement in 7+ days    → flag resistance
#
# All escalations are written to task history[] for auditability.
# OVERDUE iMessage sent to Dad once per calendar day (flag: /tmp/zazu-overdue-notified-YYYY-MM-DD).
# ─────────────────────────────────────────────────────────────────────────────

export PATH="/Users/zazunyche/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/zazunyche"

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG="$BOARD_DIR/logs/priority-escalation.log"
BOARD_FILE="$BOARD_DIR/board-data.json"

source "$BOARD_DIR/scripts/lib/zazu-notify.sh"
if ! source ~/.zazu-config 2>/dev/null; then
  log_ts "ERROR: ~/.zazu-config not found" "$LOG"
  exit 1
fi

log_ts "priority-escalation.sh started" "$LOG"

# Run the escalation logic via Node (same runtime as the rest of the board tooling)
node - << 'NODEEOF'
"use strict";
const fs = require("fs");
const path = require("path");

const BOARD_FILE = "/Users/zazunyche/Documents/src/family-board/board-data.json";
const LOG        = "/Users/zazunyche/Documents/src/family-board/logs/priority-escalation.log";

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG, line);
}

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function daysUntil(dateStr) {
  const due  = new Date(dateStr + "T00:00:00");
  const now  = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due - now) / (1000 * 60 * 60 * 24));
}

function daysSince(isoStr) {
  return Math.round((Date.now() - new Date(isoStr).getTime()) / (1000 * 60 * 60 * 24));
}

const PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH"];
function escalateOne(p) {
  const idx = PRIORITY_ORDER.indexOf(p);
  return idx < PRIORITY_ORDER.length - 1 ? PRIORITY_ORDER[idx + 1] : p;
}

let data;
try {
  data = JSON.parse(fs.readFileSync(BOARD_FILE, "utf8"));
} catch (e) {
  log(`ERROR: could not read board-data.json: ${e.message}`);
  process.exit(1);
}

const NOW_ISO = new Date().toISOString();
const escalations = [];
const resistanceFlags = [];

for (const task of (data.tasks || [])) {
  if (task.stage === "DONE") continue;

  // ── Deadline-based escalation ───────────────────────────────────────────
  if (task.dueDate) {
    const days = daysUntil(task.dueDate);

    if (days < 0) {
      // OVERDUE — past the deadline entirely
      const daysOver = Math.abs(days);
      log(`OVERDUE: "${task.title}" — ${daysOver} day(s) past due (${task.dueDate}), priority: ${task.priority}`);
      escalations.push({ id: task.id, title: task.title, type: "OVERDUE", daysLeft: days, daysOver, from: task.priority, to: task.priority });
    } else if (days <= 1) {
      // URGENT — due today or tomorrow
      log(`URGENT: "${task.title}" due in ${days} day(s) (${task.dueDate}) — current priority: ${task.priority}`);
      escalations.push({ id: task.id, title: task.title, type: "URGENT", daysLeft: days, from: task.priority, to: task.priority });
    } else if (days <= 3 && task.priority !== "HIGH") {
      const from = task.priority;
      task.priority = "HIGH";
      task.updatedAt = NOW_ISO;
      (task.history = task.history || []).push({
        timestamp: NOW_ISO,
        actor: "ZAZU",
        change: `priority: ${from} → HIGH | auto-escalated (dueDate in ${days} days, ≤3-day threshold)`
      });
      log(`Escalated "${task.title}" ${from} → HIGH (${days} days until ${task.dueDate})`);
      escalations.push({ id: task.id, title: task.title, type: "ESCALATION", daysLeft: days, from, to: "HIGH" });
    } else if (days <= 14 && (task.priority === "LOW" || task.priority === "MEDIUM")) {
      const from = task.priority;
      const to   = escalateOne(from);
      task.priority = to;
      task.updatedAt = NOW_ISO;
      (task.history = task.history || []).push({
        timestamp: NOW_ISO,
        actor: "ZAZU",
        change: `priority: ${from} → ${to} | auto-escalated (dueDate in ${days} days, ≤14-day threshold)`
      });
      log(`Escalated "${task.title}" ${from} → ${to} (${days} days until ${task.dueDate})`);
      escalations.push({ id: task.id, title: task.title, type: "ESCALATION", daysLeft: days, from, to });
    }
  }

  // ── Resistance detection (briefed 3+ times, no stage movement in 7+ days) ──
  const briefCount = task.briefCount || 0;
  // Use stageHistory to find when the current stage was entered — updatedAt
  // changes on every write (escalation, notes) so it's useless as a stale signal.
  const currentStageEntry = (task.stageHistory || [])
    .filter(s => s.stage === task.stage && s.exitedAt === null)
    .slice(-1)[0];
  const stageEnteredAt = currentStageEntry
    ? currentStageEntry.enteredAt
    : (task.createdAt || NOW_ISO);
  const staleDays = daysSince(stageEnteredAt);

  if (briefCount >= 3 && staleDays >= 7) {
    const newScore = Math.min(5, Math.floor(staleDays / 7)); // 1pt per week stale, max 5
    // Update score if it has grown (don't write if unchanged)
    if (newScore > (task.resistanceScore || 0)) {
      const prevScore = task.resistanceScore || 0;
      task.resistanceScore = newScore;
      task.updatedAt = NOW_ISO;
      (task.history = task.history || []).push({
        timestamp: NOW_ISO,
        actor: "ZAZU",
        change: `resistanceScore: ${prevScore} → ${newScore} (briefed ${briefCount}x, no stage movement for ${staleDays} days)`
      });
      log(`Resistance flagged: "${task.title}" — briefed ${briefCount}x, stale ${staleDays} days, score: ${newScore}`);
      resistanceFlags.push({ id: task.id, title: task.title, briefCount, staleDays, score: newScore });
    }
  }
}

// ── Write updated board ──────────────────────────────────────────────────────
data.meta.lastUpdated    = NOW_ISO;
data.meta.lastUpdatedBy  = "ZAZU";

try {
  fs.writeFileSync(BOARD_FILE, JSON.stringify(data, null, 2));
  log(`Board updated. Escalations: ${escalations.length}, Resistance flags: ${resistanceFlags.length}`);
} catch (e) {
  log(`ERROR: could not write board-data.json: ${e.message}`);
  process.exit(1);
}

// ── Emit results to the escalation log + temp file for bash iMessage step ──
const result = { escalations, resistanceFlags };
fs.appendFileSync(LOG, `[${new Date().toISOString()}] Result: ${JSON.stringify(result)}\n`);
fs.writeFileSync("/tmp/zazu-escalation-result.json", JSON.stringify(result));
NODEEOF

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  log_ts "priority-escalation.sh: Node script failed — exit $EXIT_CODE" "$LOG"
  log_ts "priority-escalation.sh complete (error)" "$LOG"
  exit 1
fi

# ── iMessage Dad for OVERDUE tasks (once per calendar day, daytime only) ─────
# Sends once per calendar day IF the current hour is 08:00–21:59 ET.
# Night runs (nightly at 00:30) skip the send; the flag is only set on actual
# delivery, so the first daytime run of the day will still catch it.
RESULT_FILE="/tmp/zazu-escalation-result.json"
TODAY=$(date +%Y-%m-%d)
NOTIFIED_FLAG="/tmp/zazu-overdue-notified-${TODAY}"
SEND_HOUR=$(date +%H)

if [ -f "$RESULT_FILE" ] && [ ! -f "$NOTIFIED_FLAG" ] && [ "$SEND_HOUR" -ge 8 ] && [ "$SEND_HOUR" -lt 22 ]; then
  OVERDUE_COUNT=$(node -e "try{const r=require('$RESULT_FILE');console.log(r.escalations.filter(e=>e.type==='OVERDUE').length)}catch(e){console.log(0)}" 2>/dev/null)

  if [ "${OVERDUE_COUNT:-0}" -gt "0" ] 2>/dev/null; then
    OVERDUE_MSG=$(node -e "
const r=require('$RESULT_FILE');
const items=r.escalations.filter(e=>e.type==='OVERDUE');
const lines=items.map(e=>'• '+e.title+' ('+e.daysOver+'d past due)');
console.log('⚠️ OVERDUE tasks ('+items.length+'):\n'+lines.join('\n')+'\n\nMark done or snooze on the board.');
" 2>/dev/null)

    if [ -n "$OVERDUE_MSG" ]; then
      RESULT=$(send_imessage "$DAD_NUMBER" "$OVERDUE_MSG")
      if [[ "$RESULT" == *"sent"* ]]; then
        touch "$NOTIFIED_FLAG"
        log_ts "OVERDUE iMessage sent to Dad: $OVERDUE_COUNT task(s)" "$LOG"
      else
        log_ts "WARNING: OVERDUE iMessage failed: $RESULT" "$LOG"
      fi
    fi
  fi
fi

# ── Auto-close EXTERNAL_EVENT tasks whose dueDate has passed ──────────────────
CLOSE_OUT=$(node "$BOARD_DIR/board-tools/auto-close-events.js" --apply 2>&1)
CLOSE_EXIT=$?
log_ts "auto-close-events: $CLOSE_OUT" "$LOG"
if [ $CLOSE_EXIT -ne 0 ]; then
  log_ts "WARNING: auto-close-events.js exited $CLOSE_EXIT" "$LOG"
fi

log_ts "priority-escalation.sh complete" "$LOG"
