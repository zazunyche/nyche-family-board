#!/usr/bin/env node
/**
 * Regression test for the snooze-reopen reset in board-tools/mark-briefed.js.
 *
 * WHY THIS EXISTS
 * ---------------
 * mark-briefed.js gained a branch that, on the first briefing after a task's
 * snoozedUntil passes, resets resistanceScore to 0 and clears snoozedUntil (a
 * reopened task starts a fresh avoidance window and must not read as maximally
 * resisted before the family has seen it once this cycle). That branch does NOT
 * fire on the live board until the first recurring TX-sales-tax task un-snoozes
 * on 2027-01-01 — i.e. a bug would sit latent for ~2 months and then silently
 * mishandle resistanceScore/snoozedUntil on a real HIGH-priority tax task. This
 * test exercises the branch now, deterministically, by passing nowIso in (the
 * production function takes the clock as an argument, so no mocking is needed).
 *
 * It imports the live markBriefed from mark-briefed.js, so if the reset logic is
 * weakened (score not cleared, snooze not cleared, wrong fire conditions) these
 * cases fail here.
 *
 * Run: node scripts/tests/test_mark_briefed.js   (exit 0 = all pass)
 * No file I/O — mark-briefed.js guards its board-data.json read/write behind
 * `require.main === module`, so importing it is side-effect-free.
 */
"use strict";

const path = require("path");
const { markBriefed } = require(path.join(__dirname, "..", "..", "board-tools", "mark-briefed.js"));

const NOW = "2027-01-01T13:00:00.000Z"; // first briefing on/after the TX-Q4 snooze expiry

let failures = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  [${ok ? "ok " : "FAIL"}] ${name}${ok ? "" : "  — " + detail}`);
}

// --- Case 1: the real TX-tax scenario — snoozed in the past, resistanceScore 5.
// Expect: reopened — score reset to 0, snooze cleared, briefed, history appended.
{
  const task = {
    id: "t_tax_q4", stage: "IDEA", snoozedUntil: "2027-01-01",
    resistanceScore: 5, briefCount: 88, history: [],
  };
  // snoozedUntil === today (2027-01-01) must count as EXPIRED, not still-snoozed:
  // the guard skips only when snoozedUntil > today is false AND >= today... verify
  // the boundary explicitly below in Case 4. Here use a strictly-past snooze.
  task.snoozedUntil = "2026-12-20";
  const prevHist = task.history.length;
  const count = markBriefed({ tasks: [task] }, NOW);
  check("tax_reopen_counts_as_briefed", count === 1, `count=${count}`);
  check("tax_resistance_reset_to_0", task.resistanceScore === 0, `score=${task.resistanceScore}`);
  check("tax_snooze_cleared", task.snoozedUntil === null, `snooze=${task.snoozedUntil}`);
  check("tax_briefcount_incremented", task.briefCount === 89, `briefCount=${task.briefCount}`);
  check("tax_lastBriefed_set", task.lastBriefed === NOW, `lastBriefed=${task.lastBriefed}`);
  check("tax_history_appended", task.history.length === prevHist + 1, `hist=${task.history.length}`);
  check("tax_history_mentions_reset",
    /resistanceScore 5 → 0/.test(task.history[task.history.length - 1].change),
    `change="${task.history[task.history.length - 1].change}"`);
}

// --- Case 2: snooze expired but resistanceScore already 0 — snooze still clears,
// task still briefed, but NO "score → 0" phrase (prevScore was 0, nothing to reset).
{
  const task = { id: "t_zero", stage: "ACTIVE", snoozedUntil: "2026-10-01", resistanceScore: 0, briefCount: 3, history: [] };
  markBriefed({ tasks: [task] }, NOW);
  check("zero_snooze_cleared", task.snoozedUntil === null, `snooze=${task.snoozedUntil}`);
  check("zero_score_stays_0", task.resistanceScore === 0, `score=${task.resistanceScore}`);
  check("zero_no_reset_phrase",
    !/→ 0/.test(task.history[task.history.length - 1].change),
    `change="${task.history[task.history.length - 1].change}"`);
}

// --- Case 3: still snoozed in the FUTURE — skipped entirely, nothing touched.
{
  const task = { id: "t_future", stage: "IDEA", snoozedUntil: "2027-07-01", resistanceScore: 5, briefCount: 88, history: [] };
  const count = markBriefed({ tasks: [task] }, NOW);
  check("future_not_counted", count === 0, `count=${count}`);
  check("future_score_untouched", task.resistanceScore === 5, `score=${task.resistanceScore}`);
  check("future_snooze_untouched", task.snoozedUntil === "2027-07-01", `snooze=${task.snoozedUntil}`);
  check("future_not_briefed", task.briefCount === 88 && task.lastBriefed === undefined, `briefCount=${task.briefCount}`);
  check("future_no_history", task.history.length === 0, `hist=${task.history.length}`);
}

// --- Case 4: snoozedUntil === today — the >= today guard treats it as STILL
// snoozed (not yet expired), so it is skipped. Reopen fires only once the date
// is strictly in the past (next day's briefing). This pins the boundary so a
// future refactor can't flip it to an off-by-one double-reset.
{
  const task = { id: "t_boundary", stage: "IDEA", snoozedUntil: "2027-01-01", resistanceScore: 5, briefCount: 10, history: [] };
  const count = markBriefed({ tasks: [task] }, NOW); // NOW's date is 2027-01-01
  check("boundary_today_still_snoozed", count === 0 && task.snoozedUntil === "2027-01-01",
    `count=${count} snooze=${task.snoozedUntil}`);
}

// --- Case 5: ordinary active task, no snooze — briefed normally, no reopen branch.
{
  const task = { id: "t_plain", stage: "ACTIVE", briefCount: 100, resistanceScore: 4, history: [] };
  markBriefed({ tasks: [task] }, NOW);
  check("plain_briefed", task.briefCount === 101 && task.lastBriefed === NOW, `briefCount=${task.briefCount}`);
  check("plain_score_untouched", task.resistanceScore === 4, `score=${task.resistanceScore}`);
  check("plain_no_history", task.history.length === 0, `hist=${task.history.length}`);
}

// --- Case 6: DONE task is never briefed, even if its snooze has expired.
{
  const task = { id: "t_done", stage: "DONE", snoozedUntil: "2026-01-01", resistanceScore: 5, briefCount: 7, history: [] };
  const count = markBriefed({ tasks: [task] }, NOW);
  check("done_skipped", count === 0 && task.briefCount === 7 && task.snoozedUntil === "2026-01-01",
    `count=${count} snooze=${task.snoozedUntil}`);
}

console.log();
if (failures) {
  console.log(`${failures} FAILURE(S) — snooze-reopen reset in mark-briefed.js is broken.`);
  process.exit(1);
}
console.log("All cases pass — snooze-reopen reset fires once on a strictly-past snooze "
  + "(clearing resistanceScore + snoozedUntil), and leaves future-snoozed, DONE, and "
  + "plain active tasks exactly as before.");
