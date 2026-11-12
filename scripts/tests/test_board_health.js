#!/usr/bin/env node
/**
 * Regression test for analytics/scripts/board-health.js.
 *
 * WHY THIS EXISTS
 * ---------------
 * board-health.js is the canonical data-quality READ path — the daily snapshot
 * of stale / overdue / high-brief / resistance tasks. Its stale signal leans on
 * stageAgeDays(), which finds the task's OPEN stageHistory row and measures days
 * since enteredAt. Live tasks persist the active stage in TWO shapes:
 *   { stage, enteredAt, exitedAt: null }   (newer)
 *   { stage, enteredAt }  — NO exitedAt key (older: t_insure01, t_15sig01)
 * The original predicate matched only `exitedAt === null`, silently missing the
 * keyless shape and falling back to createdAt — which INFLATES stage-age for
 * exactly the oldest, most-briefed tasks. A heartbeat on 2026-11-10 fixed the
 * predicate to `=== null || === undefined` across four scripts, and a 2026-11-11
 * heartbeat guarded the two remaining READ paths. staleness-triage.js got its
 * own suite; this one guards board-health.js so a future edit to line 42 can't
 * quietly reintroduce the createdAt-fallback inflation on the stale list.
 *
 * computeReport()/stageAgeDays() are pure (clock passed in, no argv/file writes)
 * and the CLI is guarded behind `require.main === module`, so importing is
 * side-effect-free.
 *
 * Run: node scripts/tests/test_board_health.js   (exit 0 = all pass)
 */
"use strict";

const path = require("path");
const { stageAgeDays, computeReport, isSnoozed, isDormantFutureIdea, calDaysBetween } =
  require(path.join(__dirname, "..", "..", "analytics", "scripts", "board-health.js"));

const NOW_MS = Date.parse("2026-11-11T05:00:00.000Z"); // 2026-11-11 00:00 ET
const DAY = 86400000;
const daysAgo = (n) => new Date(NOW_MS - n * DAY).toISOString();
const dateET = (nDaysFromNow) =>
  new Date(NOW_MS + nDaysFromNow * DAY).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

let failures = 0;
function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`  [${ok ? "ok " : "FAIL"}] ${name}${ok ? "" : "  — " + detail}`);
}

// ── stageAgeDays ─────────────────────────────────────────────────────────────

// Case 1 (REGRESSION ANCHOR): open row has NO exitedAt key — the real on-board
// shape (t_insure01's ACTIVE row). Age must come from enteredAt (10d), NOT fall
// back to createdAt (60d). The old `exitedAt === null`-only predicate would miss
// this row and return 60 — so this assertion is non-vacuous.
{
  const t = {
    stage: "ACTIVE",
    createdAt: daysAgo(60),
    stageHistory: [{ stage: "ACTIVE", enteredAt: daysAgo(10) }],
  };
  const age = stageAgeDays(t, NOW_MS);
  check("keyless open row → age from enteredAt (10d), not createdAt (60d)", age === 10, `got ${age}`);
}

// Case 2: explicit exitedAt:null open row — must also read enteredAt.
{
  const t = {
    stage: "ACTIVE",
    createdAt: daysAgo(60),
    stageHistory: [{ stage: "ACTIVE", enteredAt: daysAgo(22), exitedAt: null }],
  };
  const age = stageAgeDays(t, NOW_MS);
  check("explicit exitedAt:null open row → enteredAt (22d)", age === 22, `got ${age}`);
}

// Case 3: picks the CURRENT stage's open row, ignoring a closed prior stage.
{
  const t = {
    stage: "ACTIVE",
    createdAt: daysAgo(90),
    stageHistory: [
      { stage: "IDEA", enteredAt: daysAgo(90), exitedAt: daysAgo(30), durationMs: 60 * DAY },
      { stage: "ACTIVE", enteredAt: daysAgo(30) },
    ],
  };
  const age = stageAgeDays(t, NOW_MS);
  check("multi-row → measures current ACTIVE stage (30d), not IDEA", age === 30, `got ${age}`);
}

// Case 4: no stageHistory → createdAt fallback.
{
  const t = { stage: "ACTIVE", createdAt: daysAgo(5), stageHistory: [] };
  const age = stageAgeDays(t, NOW_MS);
  check("empty stageHistory → createdAt fallback (5d)", age === 5, `got ${age}`);
}

// ── predicates ───────────────────────────────────────────────────────────────

check("isSnoozed: future snoozedUntil → true",
  isSnoozed({ snoozedUntil: dateET(30) }, NOW_MS) === true, "expected true");
check("isSnoozed: past snoozedUntil → false",
  !isSnoozed({ snoozedUntil: dateET(-30) }, NOW_MS), "expected false");
check("isDormantFutureIdea: IDEA due >30d out → true",
  isDormantFutureIdea({ stage: "IDEA", dueDate: dateET(60) }, NOW_MS) === true, "expected true");
check("isDormantFutureIdea: ACTIVE never dormant",
  !isDormantFutureIdea({ stage: "ACTIVE", dueDate: dateET(60) }, NOW_MS), "expected false");
check("calDaysBetween: due-today is 0 (not overdue)",
  calDaysBetween(dateET(0), dateET(0)) === 0, "expected 0");

// ── computeReport (integration) ──────────────────────────────────────────────

// A synthetic board exercising every flag bucket. The keyless-open-row stale
// task is the integration-level regression guard: under the old predicate its
// age would inflate off createdAt but still be stale, so to make the test bite
// we assert the REPORTED ageDays equals the enteredAt-derived value.
const board = {
  tasks: [
    // 1. Stale, keyless open row: 150d in ACTIVE (createdAt 400d ago).
    { id: "t_stale_keyless", title: "Stale keyless", stage: "ACTIVE", owner: "DAD",
      category: "HOME", priority: "MEDIUM", taskType: "RESEARCH", effortTag: "M",
      briefCount: 40, resistanceScore: 5, createdAt: daysAgo(400),
      stageHistory: [{ stage: "ACTIVE", enteredAt: daysAgo(150) }] },
    // 2. Fresh active: 3d in stage → not stale.
    { id: "t_fresh", title: "Fresh", stage: "ACTIVE", owner: "MOM",
      category: "ADMIN", priority: "LOW", taskType: "ERRAND", effortTag: "S",
      briefCount: 1, createdAt: daysAgo(3),
      stageHistory: [{ stage: "ACTIVE", enteredAt: daysAgo(3), exitedAt: null }] },
    // 3. Overdue by 10 calendar days.
    { id: "t_overdue", title: "Overdue", stage: "ACTIVE", owner: "DAD",
      category: "ADMIN", priority: "HIGH", taskType: "MAINTENANCE", effortTag: "M",
      briefCount: 2, dueDate: dateET(-10), createdAt: daysAgo(20),
      stageHistory: [{ stage: "ACTIVE", enteredAt: daysAgo(5) }] },
    // 4. Snoozed quarterly task: stale-aged but parked → excluded from stale/highBrief.
    { id: "t_snoozed", title: "Snoozed", stage: "IDEA", owner: "DAD",
      category: "ADMIN", priority: "HIGH", taskType: "MAINTENANCE", effortTag: "S",
      briefCount: 88, snoozedUntil: dateET(60), createdAt: daysAgo(100),
      stageHistory: [{ stage: "IDEA", enteredAt: daysAgo(100) }] },
    // 5. Dormant future IDEA (due 90d out) → not stale despite old enteredAt.
    { id: "t_dormant", title: "Dormant idea", stage: "IDEA", owner: "BOTH",
      category: "GOALS", priority: "MEDIUM", taskType: "RESEARCH", effortTag: "L",
      briefCount: 1, dueDate: dateET(90), createdAt: daysAgo(40),
      stageHistory: [{ stage: "IDEA", enteredAt: daysAgo(40) }] },
    // 6. Missing fields + DONE (excluded from active) → sanity for counts.
    { id: "t_done", title: "Done", stage: "DONE", owner: "DAD",
      category: "HOME", priority: "LOW", createdAt: daysAgo(10),
      stageHistory: [{ stage: "DONE", enteredAt: daysAgo(10), exitedAt: null }] },
  ],
};

const r = computeReport(board, NOW_MS);

check("summary: 6 total / 5 active / 1 done",
  r.summary.total === 6 && r.summary.active === 5 && r.summary.done === 1,
  JSON.stringify(r.summary));

const staleIds = r.stale.map(s => s.id).sort();
check("stale list = exactly the keyless + overdue(5d? no) tasks",
  staleIds.length === 1 && staleIds[0] === "t_stale_keyless",
  `got ${JSON.stringify(staleIds)}`);

const staleRow = r.stale.find(s => s.id === "t_stale_keyless");
check("REGRESSION: reported stale ageDays = 150 (enteredAt), not 400 (createdAt)",
  staleRow && staleRow.ageDays === 150, `got ${staleRow && staleRow.ageDays}`);

check("snoozed task excluded from stale", !staleIds.includes("t_snoozed"), "t_snoozed leaked into stale");
check("dormant future IDEA excluded from stale", !staleIds.includes("t_dormant"), "t_dormant leaked into stale");

check("overdue = [t_overdue] at 10 days",
  r.overdue.length === 1 && r.overdue[0].id === "t_overdue" && r.overdue[0].overdueDays === 10,
  JSON.stringify(r.overdue));

const highBriefIds = r.highBrief.map(h => h.id).sort();
check("highBrief excludes snoozed (88 briefs) but includes keyless (40)",
  highBriefIds.includes("t_stale_keyless") && !highBriefIds.includes("t_snoozed"),
  `got ${JSON.stringify(highBriefIds)}`);

check("missingFields.taskType flags only the DONE-task-free active set (none missing here)",
  r.missingFields.taskType.length === 0, JSON.stringify(r.missingFields.taskType));

// ── summary ──────────────────────────────────────────────────────────────────
console.log("");
if (failures) {
  console.error(`FAIL — ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("All board-health assertions passed.");
