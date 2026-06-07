#!/usr/bin/env node
/**
 * board-tools/mark-reminded.js
 * Zazu calls this after she has delivered a pending reminder via iMessage.
 * Marks the reminder as sent so it doesn't fire again.
 *
 * Usage:
 *   node board-tools/mark-reminded.js --reminder rem_abc123
 *   node board-tools/mark-reminded.js --reminder rem_abc123 --actor ZAZU
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "board-data.json");
const args      = process.argv.slice(2);
const argVal    = k => { const i = args.indexOf(k); return i>=0 ? args[i+1] : null; };

const REM_ID = argVal("--reminder");
const ACTOR  = argVal("--actor") || "ZAZU";

if (!REM_ID) {
  console.error("ERROR: --reminder <id> is required");
  process.exit(1);
}

let board;
try {
  board = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch(e) {
  console.error("ERROR: Could not read board-data.json:", e.message);
  process.exit(1);
}

const reminders = board.pendingReminders || [];
const rem = reminders.find(r => r.id === REM_ID);

if (!rem) {
  console.error(`ERROR: Reminder "${REM_ID}" not found`);
  process.exit(1);
}

if (rem.sent) {
  console.log(`Reminder ${REM_ID} already marked sent — no change`);
  process.exit(0);
}

rem.sent   = true;
rem.sentAt = new Date().toISOString();
rem.sentBy = ACTOR;

board.meta.lastUpdated   = new Date().toISOString();
board.meta.lastUpdatedBy = ACTOR;

const tmp = DATA_FILE + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(board, null, 2), "utf8");
fs.renameSync(tmp, DATA_FILE);

console.log(`✓ Reminder ${REM_ID} marked as sent`);
