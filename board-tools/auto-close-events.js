#!/usr/bin/env node
/**
 * board-tools/auto-close-events.js
 *
 * Implements the analytics plan rule:
 *   "When a task of type EXTERNAL_EVENT reaches its dueDate and is still
 *    in any stage except DONE, Zazu auto-archives it nightly."
 *
 * The event passed — the family either attended or didn't, but rescheduling
 * isn't an option. Auto-closing prevents calendar-event noise from
 * accumulating on the active board and corrupting stall-time analytics.
 *
 * Usage:
 *   node board-tools/auto-close-events.js            # dry-run (prints only)
 *   node board-tools/auto-close-events.js --apply    # writes to board-data.json
 *
 * Called nightly from priority-escalation.sh.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const BOARD_FILE = path.join(__dirname, '..', 'board-data.json');
const APPLY      = process.argv.includes('--apply');

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isPastDue(dueDate) {
  // Close events on their dueDate or after — the event has happened (or is ending tonight)
  return dueDate <= todayLocal();
}

let board;
try {
  board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
} catch (e) {
  console.error(`ERROR: could not read board-data.json: ${e.message}`);
  process.exit(1);
}

const nowISO  = new Date().toISOString();
const closing = [];

for (const task of (board.tasks || [])) {
  if (task.stage === 'DONE') continue;
  if (task.taskType !== 'EXTERNAL_EVENT') continue;
  if (!task.dueDate) continue;
  if (!isPastDue(task.dueDate)) continue;

  closing.push(task);
}

if (closing.length === 0) {
  console.log('auto-close-events: no EXTERNAL_EVENT tasks to close.');
  process.exit(0);
}

for (const task of closing) {
  console.log(`auto-close-events: will close ${task.id} — "${task.title}" (dueDate: ${task.dueDate})`);
}

if (!APPLY) {
  console.log('\nDry-run. Pass --apply to write changes.');
  process.exit(0);
}

// Apply
for (const task of closing) {
  task.stageHistory = task.stageHistory || [];
  const openEntry = task.stageHistory.slice().reverse().find(s => s.exitedAt === null);
  if (openEntry) {
    openEntry.exitedAt   = nowISO;
    openEntry.durationMs = new Date(nowISO) - new Date(openEntry.enteredAt);
  }
  task.stageHistory.push({ stage: 'DONE', enteredAt: nowISO, exitedAt: null, durationMs: null });

  task.stage       = 'DONE';
  task.completedAt = nowISO;
  task.updatedAt   = nowISO;

  task.history = task.history || [];
  task.history.push({
    timestamp: nowISO,
    actor:     'ZAZU',
    change:    `auto-closed: EXTERNAL_EVENT past dueDate ${task.dueDate} — event passed`
  });

  console.log(`✓ Closed ${task.id}: ${task.title}`);
}

board.meta.lastUpdated   = nowISO;
board.meta.lastUpdatedBy = 'ZAZU';

const tmp = BOARD_FILE + '.tmp';
try {
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2), 'utf8');
  fs.renameSync(tmp, BOARD_FILE);
  console.log(`Board saved. ${closing.length} event(s) auto-closed.`);
} catch (e) {
  console.error(`ERROR: Write failed: ${e.message}`);
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  process.exit(1);
}
