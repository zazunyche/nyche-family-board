#!/usr/bin/env node
/**
 * board-tools/auto-close-events.js
 *
 * Implements the analytics plan rule:
 *   "When a time-bounded external-event task reaches its dueDate and is still
 *    in any stage except DONE, Zazu auto-archives it nightly."
 *
 * The event passed — the family either attended or didn't, but rescheduling
 * isn't an option. Auto-closing prevents calendar-event noise from
 * accumulating on the active board and corrupting stall-time analytics.
 *
 * taskType note: the analytics-plan enum lists both `EVENT` and the older
 * `EXTERNAL_EVENT`, but Zazu's taskType inference (the backfill that actually
 * tags new calendar/school-notice tasks) only ever emits `EVENT`. This script
 * originally filtered on `EXTERNAL_EVENT` alone, so it matched nothing on the
 * real board — past-due events sat on the active board accruing resistance as
 * false "stalls" (e.g. t_m2rnhvo "Ally's Birthday", briefed 33x and hand-closed
 * 22 days after the event). We now accept BOTH spellings so either value closes.
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

// taskType values that represent a time-bounded external occurrence whose
// closure is date-driven, not execution-driven.
const EVENT_TYPES = new Set(['EVENT', 'EXTERNAL_EVENT']);

function isEventType(taskType) {
  return EVENT_TYPES.has(taskType);
}

// Format a Date as a local YYYY-MM-DD string. Clock is injected so the
// date logic is testable without stubbing the global Date.
function todayLocal(now) {
  const d = now || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Close events on their dueDate or after — the event has happened (or is
// ending tonight). Both args are YYYY-MM-DD strings (lexical compare is safe).
function isPastDue(dueDate, today) {
  return dueDate <= today;
}

// Pure selector: given the board's tasks and today's local date string,
// return the tasks that should be auto-closed. No I/O, no clock.
function selectClosable(tasks, today) {
  const closing = [];
  for (const task of (tasks || [])) {
    if (task.stage === 'DONE') continue;
    if (!isEventType(task.taskType)) continue;
    if (!task.dueDate) continue;
    if (!isPastDue(task.dueDate, today)) continue;
    closing.push(task);
  }
  return closing;
}

// Pure mutation: close a single task in place, stamping stageHistory/history
// with the given ISO timestamp. Returns the mutated task.
function closeTask(task, nowISO) {
  task.stageHistory = task.stageHistory || [];
  // Open entry = exitedAt null OR absent. Live tasks persist the active stage as
  // just { stage, enteredAt } (no exitedAt key), so a strict `=== null` check
  // misses them and leaves two concurrently-open entries. See test_update_stage.
  const openEntry = task.stageHistory.slice().reverse().find(s => s.exitedAt === null || s.exitedAt === undefined);
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
    change:    `auto-closed: ${task.taskType} past dueDate ${task.dueDate} — event passed`
  });

  return task;
}

function main() {
  const APPLY = process.argv.includes('--apply');

  let board;
  try {
    board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
  } catch (e) {
    console.error(`ERROR: could not read board-data.json: ${e.message}`);
    process.exit(1);
  }

  const nowISO  = new Date().toISOString();
  const today   = todayLocal();
  const closing = selectClosable(board.tasks, today);

  if (closing.length === 0) {
    console.log('auto-close-events: no event tasks to close.');
    process.exit(0);
  }

  for (const task of closing) {
    console.log(`auto-close-events: will close ${task.id} — "${task.title}" (dueDate: ${task.dueDate})`);
  }

  if (!APPLY) {
    console.log('\nDry-run. Pass --apply to write changes.');
    process.exit(0);
  }

  for (const task of closing) {
    closeTask(task, nowISO);
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
}

module.exports = { isEventType, todayLocal, isPastDue, selectClosable, closeTask, EVENT_TYPES };

if (require.main === module) {
  main();
}
