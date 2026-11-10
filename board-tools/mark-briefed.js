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
 * Snooze-reopen reset: a task whose snoozedUntil has now PASSED is briefed
 * again starting today — a fresh active window. resistanceScore measures
 * avoidance *within the current window*, so carrying a prior cycle's score
 * (e.g. the recurring TX-tax tasks parked at resistanceScore 5) would make a
 * just-reopened task read as maximally-resisted before the family has seen it
 * once this cycle. On that first post-snooze briefing we therefore reset
 * resistanceScore to 0 and clear the spent snoozedUntil (fires once; clearing
 * the field prevents re-fire). briefCount is lifetime-cumulative and is left
 * alone.
 *
 * Usage (no args needed):
 *   node board-tools/mark-briefed.js
 *
 * The per-board mutation is the pure, side-effect-free markBriefed(board, nowIso)
 * exported below; file I/O (read board-data.json, atomic tmp+rename write) runs
 * only when invoked as a script. This lets scripts/tests/test_mark_briefed.js
 * exercise the snooze-reopen reset without touching the real board.
 *
 * Exit codes: 0=success, 1=error
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "board-data.json");

/**
 * Mutates `board` in place: for every active (non-DONE, non-still-snoozed) task,
 * bumps briefCount and sets lastBriefed to nowIso; and, on the first briefing
 * after a snooze expires, resets the prior-cycle resistanceScore to 0 and clears
 * the spent snoozedUntil (see the "Snooze-reopen reset" note above). Returns the
 * number of tasks briefed. Pure w.r.t. the clock — nowIso is passed in.
 */
function markBriefed(board, nowIso) {
  const today = nowIso.slice(0, 10);
  let count = 0;
  for (const task of (board.tasks || [])) {
    if (task.stage === "DONE") continue;
    if (task.snoozedUntil && task.snoozedUntil >= today) continue;

    // Snooze just expired (snoozedUntil set but now in the past): this is a
    // reopen. Reset the prior-cycle resistance signal and clear the spent snooze.
    if (task.snoozedUntil && task.snoozedUntil < today) {
      const prevScore = task.resistanceScore || 0;
      const prevSnooze = task.snoozedUntil;
      task.snoozedUntil = null;
      if (prevScore > 0) task.resistanceScore = 0;
      (task.history = task.history || []).push({
        timestamp: nowIso,
        actor: "ZAZU",
        change: `snooze expired (${prevSnooze}) — reopened for briefing` +
          (prevScore > 0 ? `; resistanceScore ${prevScore} → 0 (fresh active window)` : "") +
          "; snoozedUntil cleared",
      });
    }

    task.lastBriefed = nowIso;
    task.briefCount  = (task.briefCount || 0) + 1;
    count++;
  }
  return count;
}

module.exports = { markBriefed };

if (require.main === module) {
  let board;
  try {
    board = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("ERROR: Could not read board-data.json:", e.message);
    process.exit(1);
  }

  const NOW_ISO = new Date().toISOString();
  const TODAY   = NOW_ISO.slice(0, 10);

  const count = markBriefed(board, NOW_ISO);

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
}
