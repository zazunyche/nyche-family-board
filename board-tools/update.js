#!/usr/bin/env node
/**
 * board-tools/update.js
 * Zazu calls this to update any field on an existing task.
 * Every write is atomic (tmp file → rename) and appends a history entry.
 *
 * Usage:
 *   node board-tools/update.js --task t_001 --stage ACTIVE --actor ZAZU
 *   node board-tools/update.js --task t_001 --owner MOM --actor DAD
 *   node board-tools/update.js --task t_001 --priority HIGH --actor ZAZU
 *   node board-tools/update.js --task t_001 --notes "Called BuildRight ATL, quote $4500" --actor ZAZU
 *   node board-tools/update.js --task t_001 --dueDate 2025-06-15 --actor MOM
 *   node board-tools/update.js --task t_001 --snooze 2025-06-01 --actor ZAZU
 *   node board-tools/update.js --task t_001 --zazuNotes "3 contractors researched: BuildRight, ShedPro, AtlantaSheds" --actor ZAZU
 *
 * Writable fields: stage, owner, priority, notes, dueDate, zazuNotes, snooze
 *
 * Exit codes: 0=success, 1=error
 */

const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "board-data.json");

const args   = process.argv.slice(2);
const argVal = k => { const i = args.indexOf(k); return i>=0 ? args[i+1] : null; };

const TASK_ID   = argVal("--task");
const ACTOR     = argVal("--actor") || "ZAZU";
const NEW_STAGE = argVal("--stage")?.toUpperCase();
const NEW_OWNER = argVal("--owner")?.toUpperCase();
const NEW_PRI   = argVal("--priority")?.toUpperCase();
const NEW_NOTES = argVal("--notes");
const NEW_DUE   = argVal("--dueDate");
const SNOOZE    = argVal("--snooze");
const ZAZU_NOTES= argVal("--zazuNotes");

// ── Validate ──────────────────────────────────────────────────────────────────
if (!TASK_ID) {
  console.error("ERROR: --task <id> is required");
  process.exit(1);
}

const VALID_STAGES  = ["IDEA","RESEARCH","ACTIVE","ASSIGNED","DONE"];
const VALID_OWNERS  = ["DAD","MOM","BOTH","ZAZU"];
const VALID_PRI     = ["HIGH","MEDIUM","LOW"];

if (NEW_STAGE && !VALID_STAGES.includes(NEW_STAGE)) {
  console.error(`ERROR: invalid stage "${NEW_STAGE}". Valid: ${VALID_STAGES.join(", ")}`);
  process.exit(1);
}
if (NEW_OWNER && !VALID_OWNERS.includes(NEW_OWNER)) {
  console.error(`ERROR: invalid owner "${NEW_OWNER}". Valid: ${VALID_OWNERS.join(", ")}`);
  process.exit(1);
}
if (NEW_PRI && !VALID_PRI.includes(NEW_PRI)) {
  console.error(`ERROR: invalid priority "${NEW_PRI}". Valid: ${VALID_PRI.join(", ")}`);
  process.exit(1);
}

// ── Load ──────────────────────────────────────────────────────────────────────
let board;
try {
  board = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch(e) {
  console.error("ERROR: Could not read board-data.json:", e.message);
  process.exit(1);
}

const task = board.tasks.find(t => t.id === TASK_ID);
if (!task) {
  console.error(`ERROR: Task "${TASK_ID}" not found`);
  process.exit(1);
}

// ── Apply changes ─────────────────────────────────────────────────────────────
const changes = [];
const nowISO  = new Date().toISOString();

if (NEW_STAGE && NEW_STAGE !== task.stage) {
  changes.push(`stage: ${task.stage} → ${NEW_STAGE}`);

  // Close the current stageHistory entry
  task.stageHistory = task.stageHistory || [];
  const openEntry = task.stageHistory.slice().reverse().find(s => s.exitedAt === null);
  if (openEntry) {
    openEntry.exitedAt  = nowISO;
    openEntry.durationMs = new Date(nowISO) - new Date(openEntry.enteredAt);
  }
  // Open a new entry for the incoming stage
  task.stageHistory.push({ stage: NEW_STAGE, enteredAt: nowISO, exitedAt: null, durationMs: null });

  task.stage = NEW_STAGE;
  if (NEW_STAGE === "DONE" && !task.completedAt) {
    task.completedAt = nowISO;
    changes.push("completedAt set");
  }
}

if (NEW_OWNER && NEW_OWNER !== task.owner) {
  changes.push(`owner: ${task.owner} → ${NEW_OWNER}`);
  task.owner = NEW_OWNER;
}

if (NEW_PRI && NEW_PRI !== task.priority) {
  changes.push(`priority: ${task.priority} → ${NEW_PRI}`);
  task.priority = NEW_PRI;
}

if (NEW_NOTES !== null && NEW_NOTES !== undefined && NEW_NOTES !== task.notes) {
  changes.push("notes updated");
  task.notes = NEW_NOTES;
}

if (ZAZU_NOTES !== null && ZAZU_NOTES !== undefined) {
  changes.push("zazuNotes updated");
  task.zazuNotes = ZAZU_NOTES;
}

if (NEW_DUE !== null && NEW_DUE !== undefined && NEW_DUE !== task.dueDate) {
  changes.push(`dueDate: ${task.dueDate||"none"} → ${NEW_DUE}`);
  task.dueDate = NEW_DUE || null;
}

if (SNOOZE !== null && SNOOZE !== undefined) {
  changes.push(`snoozedUntil: ${task.snoozedUntil||"none"} → ${SNOOZE}`);
  task.snoozedUntil = SNOOZE || null;
}

if (changes.length === 0) {
  console.log("No changes to apply.");
  process.exit(0);
}

// ── Stamp and append history ──────────────────────────────────────────────────
task.updatedAt = nowISO;
task.history   = task.history || [];
task.history.push({
  timestamp: nowISO,
  actor:     ACTOR,
  change:    changes.join(" | ")
});

// ── Write atomically ──────────────────────────────────────────────────────────
board.meta.lastUpdated   = nowISO;
board.meta.lastUpdatedBy = ACTOR;

const tmp = DATA_FILE + ".tmp";
try {
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
} catch(e) {
  console.error("ERROR: Write failed:", e.message);
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  process.exit(1);
}

console.log(`✓ Updated task ${TASK_ID}: ${changes.join(" | ")}`);
