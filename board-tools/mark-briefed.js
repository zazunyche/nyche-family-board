#!/usr/bin/env node
/**
 * board-tools/mark-briefed.js
 * Called by board-briefing.sh after every successful briefing delivery.
 *
 * Increments briefCount + sets lastBriefed on every active (non-DONE,
 * non-snoozed) task. Enables resistanceScore detection in
 * priority-escalation.sh: tasks briefed 3+ times with no stage movement
 * are flagged as stalled/resistant.
 *
 * Usage (no args needed):
 *   node board-tools/mark-briefed.js
 *
 * Exit codes: 0=success, 1=error
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "board-data.json");

let board;
try {
  board = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (e) {
  console.error("ERROR: Could not read board-data.json:", e.message);
  process.exit(1);
}

const NOW_ISO = new Date().toISOString();
const TODAY   = NOW_ISO.slice(0, 10);

let count = 0;
for (const task of (board.tasks || [])) {
  if (task.stage === "DONE") continue;
  if (task.snoozedUntil && task.snoozedUntil >= TODAY) continue;

  task.lastBriefed = NOW_ISO;
  task.briefCount  = (task.briefCount || 0) + 1;
  count++;
}

board.meta.lastUpdated   = NOW_ISO;
board.meta.lastUpdatedBy = "ZAZU";

const tmp = DATA_FILE + ".tmp";
try {
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
} catch (e) {
  console.error("ERROR: Write failed:", e.message);
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  process.exit(1);
}

console.log(`✓ mark-briefed: ${count} active tasks updated (briefCount+1, lastBriefed=${TODAY})`);
