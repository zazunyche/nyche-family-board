#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/priority-escalation.sh
#
# Runs nightly (added to scheduler at 00:30, after midnight-commit).
#
# Implements dynamic priority escalation per analytics plan v1.2:
#   - Task with dueDate within 14 days AND priority MEDIUM or LOW → escalate one level
#   - Task with dueDate within  3 days AND priority not HIGH       → escalate to HIGH
#   - Task with dueDate within  1 day                             → flag URGENT in log
#   - Task briefed 3+ times with no stage movement in 7+ days    → flag resistance
#
# All escalations are written to task history[] for auditability.
# iMessage summary sent to Dad only if at least one escalation occurred.
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

    if (days <= 1) {
      // URGENT flag — always, regardless of priority
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

// ── Emit results to the escalation log ──────────────────────────────────────
const result = { escalations, resistanceFlags };
fs.appendFileSync(LOG, `[${new Date().toISOString()}] Result: ${JSON.stringify(result)}\n`);
NODEEOF

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  log_ts "priority-escalation.sh: Node script failed — exit $EXIT_CODE" "$LOG"
  log_ts "priority-escalation.sh complete (error)" "$LOG"
  exit 1
fi

log_ts "priority-escalation.sh complete" "$LOG"
