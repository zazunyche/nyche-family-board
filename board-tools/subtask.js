#!/usr/bin/env node
/**
 * board-tools/subtask.js
 * Manage subtasks for an existing board task.
 *
 * Usage:
 *   node board-tools/subtask.js --task t_001 --add "Call Nathan to confirm storage space"
 *   node board-tools/subtask.js --task t_001 --done st_abc1234
 *   node board-tools/subtask.js --task t_001 --list
 *   node board-tools/subtask.js --task t_001 --add "..." --actor DAD
 *
 * Subtask schema (stored in task.subtasks[]):
 *   { id, title, stage: "TODO"|"DONE", createdAt, completedAt }
 *
 * Exit codes: 0=success, 1=error
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "board-data.json");

const args   = process.argv.slice(2);
const argVal = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

const TASK_ID   = argVal("--task");
const ADD_TITLE = argVal("--add");
const DONE_ID   = argVal("--done");
const DO_LIST   = args.includes("--list");
const ACTOR     = argVal("--actor") || "ZAZU";

if (!TASK_ID) {
  console.error("ERROR: --task <id> is required");
  process.exit(1);
}

if (!ADD_TITLE && !DONE_ID && !DO_LIST) {
  console.error("ERROR: one of --add <title>, --done <subtask-id>, or --list is required");
  process.exit(1);
}

let board;
try {
  board = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (e) {
  console.error("ERROR: Could not read board-data.json:", e.message);
  process.exit(1);
}

const task = board.tasks.find(t => t.id === TASK_ID);
if (!task) {
  console.error(`ERROR: Task "${TASK_ID}" not found`);
  process.exit(1);
}

task.subtasks = task.subtasks || [];
const nowISO = new Date().toISOString();

// ── --list ────────────────────────────────────────────────────────────────────
if (DO_LIST) {
  if (task.subtasks.length === 0) {
    console.log(`No subtasks on ${TASK_ID}.`);
  } else {
    console.log(`Subtasks for [${TASK_ID}] ${task.title}:`);
    task.subtasks.forEach(s => {
      const mark = s.stage === "DONE" ? "✓" : "○";
      const done = s.completedAt ? ` (done ${s.completedAt.slice(0, 10)})` : "";
      console.log(`  ${mark} [${s.id}] ${s.title}${done}`);
    });
    const remaining = task.subtasks.filter(s => s.stage !== "DONE").length;
    console.log(`\n${remaining}/${task.subtasks.length} remaining`);
  }
  process.exit(0);
}

// ── --add ─────────────────────────────────────────────────────────────────────
if (ADD_TITLE) {
  const stId = "st_" + Math.random().toString(36).slice(2, 10);
  const subtask = {
    id:          stId,
    title:       ADD_TITLE,
    stage:       "TODO",
    createdAt:   nowISO,
    completedAt: null,
  };
  task.subtasks.push(subtask);

  task.updatedAt = nowISO;
  (task.history = task.history || []).push({
    timestamp: nowISO,
    actor:     ACTOR,
    change:    `subtask added: [${stId}] "${ADD_TITLE}"`,
  });

  board.meta.lastUpdated   = nowISO;
  board.meta.lastUpdatedBy = ACTOR;

  const tmp = DATA_FILE + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(board, null, 2), "utf8");
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.error("ERROR: Write failed:", e.message);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    process.exit(1);
  }

  console.log(stId);
  process.stderr.write(`✓ Subtask added to ${TASK_ID}: [${stId}] "${ADD_TITLE}"\n`);
  process.exit(0);
}

// ── --done ────────────────────────────────────────────────────────────────────
if (DONE_ID) {
  const sub = task.subtasks.find(s => s.id === DONE_ID);
  if (!sub) {
    console.error(`ERROR: Subtask "${DONE_ID}" not found on task ${TASK_ID}`);
    process.exit(1);
  }

  if (sub.stage === "DONE") {
    console.log(`Subtask [${DONE_ID}] is already DONE.`);
    process.exit(0);
  }

  sub.stage       = "DONE";
  sub.completedAt = nowISO;

  task.updatedAt = nowISO;
  (task.history = task.history || []).push({
    timestamp: nowISO,
    actor:     ACTOR,
    change:    `subtask done: [${DONE_ID}] "${sub.title}"`,
  });

  const remaining = task.subtasks.filter(s => s.stage !== "DONE");
  if (remaining.length === 0) {
    process.stderr.write(`All subtasks complete on ${TASK_ID} — consider moving the parent task to DONE.\n`);
  }

  board.meta.lastUpdated   = nowISO;
  board.meta.lastUpdatedBy = ACTOR;

  const tmp = DATA_FILE + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(board, null, 2), "utf8");
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.error("ERROR: Write failed:", e.message);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    process.exit(1);
  }

  const nextUp = remaining.length > 0 ? remaining[0] : null;
  console.log(`✓ Subtask [${DONE_ID}] done. ${remaining.length} remaining.${nextUp ? ` Next: "${nextUp.title}"` : " All done!"}`);
  process.exit(0);
}
