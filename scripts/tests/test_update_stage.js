#!/usr/bin/env node
/**
 * Regression test for stage transitions in board-tools/update.js.
 *
 * WHY THIS EXISTS
 * ---------------
 * update.js (and move.js, which shells out to it) is the core board-mutation
 * tool. When it moves a task to a new stage it must CLOSE the currently-open
 * stageHistory entry (stamp exitedAt + durationMs) before opening the next one,
 * so exactly one entry is ever open. The original code found the open entry with
 * `s.exitedAt === null` — but live tasks persist the active stage as just
 * { stage, enteredAt } with NO exitedAt key (see t_insure01, t_15sig01 on the
 * board). For those tasks `exitedAt` is `undefined`, not `null`, so the strict
 * check missed the open row and pushed a SECOND open entry — leaving two
 * concurrently-open stages and corrupting the cycle-time / wait-ratio /
 * stage-funnel analytics, all of which assume one open entry per task.
 *
 * transitionStage() takes the clock as an argument and mutates in place (no
 * file I/O), and update.js guards its CLI behind `require.main === module`, so
 * importing it is side-effect-free.
 *
 * Run: node scripts/tests/test_update_stage.js   (exit 0 = all pass)
 */
"use strict";

const path = require("path");
const { transitionStage, findOpenStage } = require(path.join(__dirname, "..", "..", "board-tools", "update.js"));

const NOW = "2026-11-10T23:00:00.000Z";

let failures = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  [${ok ? "ok " : "FAIL"}] ${name}${ok ? "" : "  — " + detail}`);
}

function openEntries(sh) {
  return sh.filter(s => s.exitedAt === null || s.exitedAt === undefined);
}

// ── Case 1 (REGRESSION ANCHOR): open entry has NO exitedAt key ───────────────
// This is the real on-board shape (t_insure01's ACTIVE row). Moving to DONE must
// close that row, not leave it dangling open alongside the new one.
{
  const task = {
    id: "t_noexit", stage: "ACTIVE",
    stageHistory: [
      { stage: "IDEA",   enteredAt: "2026-06-07T00:00:00.000Z", exitedAt: "2026-06-14T07:45:00.000Z", durationMs: 632700000 },
      { stage: "ACTIVE", enteredAt: "2026-06-14T07:45:00.000Z" }, // open, NO exitedAt key
    ],
  };
  const changes = transitionStage(task, "DONE", NOW);
  check("noexit_stage_set_DONE", task.stage === "DONE", `stage=${task.stage}`);
  check("noexit_prior_row_closed", task.stageHistory[1].exitedAt === NOW, `exitedAt=${task.stageHistory[1].exitedAt}`);
  check("noexit_prior_row_duration", task.stageHistory[1].durationMs > 0, `dur=${task.stageHistory[1].durationMs}`);
  check("noexit_new_DONE_row_pushed", task.stageHistory[2] && task.stageHistory[2].stage === "DONE", `len=${task.stageHistory.length}`);
  check("noexit_exactly_one_open_entry", openEntries(task.stageHistory).length === 1, `open=${openEntries(task.stageHistory).length}`);
  check("noexit_completedAt_set", task.completedAt === NOW, `completedAt=${task.completedAt}`);
  check("noexit_changes_reported", changes.some(c => /stage: ACTIVE → DONE/.test(c)), `changes=${JSON.stringify(changes)}`);
}

// ── Case 2: open entry with explicit exitedAt: null (the other live shape) ────
{
  const task = {
    id: "t_null", stage: "ACTIVE",
    stageHistory: [{ stage: "ACTIVE", enteredAt: "2026-07-27T03:22:32.377Z", exitedAt: null, durationMs: null }],
  };
  transitionStage(task, "DONE", NOW);
  check("null_prior_row_closed", task.stageHistory[0].exitedAt === NOW, `exitedAt=${task.stageHistory[0].exitedAt}`);
  check("null_exactly_one_open_entry", openEntries(task.stageHistory).length === 1, `open=${openEntries(task.stageHistory).length}`);
}

// ── Case 3: no-op when newStage equals current stage ─────────────────────────
{
  const task = { id: "t_same", stage: "ACTIVE", stageHistory: [{ stage: "ACTIVE", enteredAt: "2026-01-01T00:00:00.000Z" }] };
  const changes = transitionStage(task, "ACTIVE", NOW);
  check("same_no_changes", changes.length === 0, `changes=${JSON.stringify(changes)}`);
  check("same_history_untouched", task.stageHistory.length === 1, `len=${task.stageHistory.length}`);
}

// ── Case 4: falsy/undefined newStage is a safe no-op ─────────────────────────
{
  const task = { id: "t_none", stage: "IDEA", stageHistory: [{ stage: "IDEA", enteredAt: "2026-01-01T00:00:00.000Z" }] };
  check("undefined_stage_noop", transitionStage(task, undefined, NOW).length === 0 && task.stageHistory.length === 1, `len=${task.stageHistory.length}`);
}

// ── Case 5: missing stageHistory is created, not crashed ─────────────────────
{
  const task = { id: "t_bare", stage: "IDEA" };
  transitionStage(task, "ACTIVE", NOW);
  check("bare_history_created", Array.isArray(task.stageHistory) && task.stageHistory.length === 1, `sh=${JSON.stringify(task.stageHistory)}`);
  check("bare_one_open_entry", openEntries(task.stageHistory).length === 1 && task.stageHistory[0].stage === "ACTIVE", "");
}

// ── Case 6: non-DONE transition does NOT set completedAt ──────────────────────
{
  const task = { id: "t_active", stage: "IDEA", stageHistory: [{ stage: "IDEA", enteredAt: "2026-01-01T00:00:00.000Z" }] };
  transitionStage(task, "ACTIVE", NOW);
  check("active_no_completedAt", task.completedAt === undefined, `completedAt=${task.completedAt}`);
}

// ── Case 7: DONE with a pre-existing completedAt is preserved (idempotent) ────
{
  const prior = "2026-10-01T00:00:00.000Z";
  const task = { id: "t_done2", stage: "ACTIVE", completedAt: prior, stageHistory: [{ stage: "ACTIVE", enteredAt: "2026-01-01T00:00:00.000Z" }] };
  transitionStage(task, "DONE", NOW);
  check("done_completedAt_preserved", task.completedAt === prior, `completedAt=${task.completedAt}`);
}

// ── findOpenStage direct ─────────────────────────────────────────────────────
check("findOpenStage_prefers_last_open",
  findOpenStage([
    { stage: "IDEA",   enteredAt: "a", exitedAt: "b" },
    { stage: "ACTIVE", enteredAt: "c" },
  ]).stage === "ACTIVE", "");
check("findOpenStage_all_closed_returns_undefined",
  findOpenStage([{ stage: "IDEA", enteredAt: "a", exitedAt: "b" }]) === undefined, "");

console.log();
if (failures) {
  console.log(`${failures} FAILURE(S) — stage transitions in update.js are broken.`);
  process.exit(1);
}
console.log("All cases pass — transitionStage closes the open stageHistory entry whether its "
  + "exitedAt is null OR absent, always leaving exactly one open entry, and sets completedAt "
  + "only on the first move into DONE.");
