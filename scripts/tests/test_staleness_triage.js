#!/usr/bin/env node
/**
 * Regression test for analytics/scripts/staleness-triage.js.
 *
 * WHY THIS EXISTS
 * ---------------
 * staleness-triage.js is a READ path: it reports which stalled tasks are
 * probably moot/done and recommends close/confirm/keep to Dad & Mom. Its age
 * signal, stageAgeDays(), finds the task's open stageHistory row and measures
 * days since enteredAt. Live tasks persist the active stage in TWO shapes —
 * { stage, enteredAt, exitedAt: null } (newer) and { stage, enteredAt } with NO
 * exitedAt key (older: t_insure01, t_15sig01). The original predicate matched
 * only `exitedAt === null`, silently missing the keyless shape and falling back
 * to createdAt — which INFLATES stage-age for exactly the oldest, most-briefed
 * tasks (t_insure01 read 157d vs. a true 150d). A heartbeat on 2026-11-10 fixed
 * the predicate to `=== null || === undefined` across four scripts but only
 * added regression tests for the two MUTATION paths (update.js,
 * auto-close-events.js). This suite guards the read-path fix here so a future
 * edit can't quietly reintroduce the createdAt-fallback inflation.
 *
 * stageAgeDays()/classify() are pure (clock passed in, no file I/O) and the CLI
 * is guarded behind `require.main === module`, so importing is side-effect-free.
 *
 * Run: node scripts/tests/test_staleness_triage.js   (exit 0 = all pass)
 */
"use strict";

const path = require("path");
const { stageAgeDays, classify } =
  require(path.join(__dirname, "..", "..", "analytics", "scripts", "staleness-triage.js"));

const NOW_MS = Date.parse("2026-11-10T23:00:00.000Z"); // 2026-11-10 18:00 ET
const DAY = 86400000;
const daysAgo = (n) => new Date(NOW_MS - n * DAY).toISOString();

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
  check("keyless open row uses enteredAt (10d), not createdAt (60d)", age === 10, `got ${age}`);
}

// Case 2: open row with explicit exitedAt:null — the newer shape. Also 10d.
{
  const t = {
    stage: "ACTIVE",
    createdAt: daysAgo(60),
    stageHistory: [{ stage: "ACTIVE", enteredAt: daysAgo(10), exitedAt: null }],
  };
  const age = stageAgeDays(t, NOW_MS);
  check("explicit exitedAt:null open row uses enteredAt (10d)", age === 10, `got ${age}`);
}

// Case 3: prior CLOSED row for a different stage + current open row. Must pick
// the OPEN row for the current stage (5d), not the closed IDEA row.
{
  const t = {
    stage: "ACTIVE",
    createdAt: daysAgo(40),
    stageHistory: [
      { stage: "IDEA", enteredAt: daysAgo(40), exitedAt: daysAgo(5), durationMs: 35 * DAY },
      { stage: "ACTIVE", enteredAt: daysAgo(5) },
    ],
  };
  const age = stageAgeDays(t, NOW_MS);
  check("picks current-stage open row (5d) over closed prior stage", age === 5, `got ${age}`);
}

// Case 4: no open row for the current stage (all closed) → createdAt fallback.
{
  const t = {
    stage: "ACTIVE",
    createdAt: daysAgo(20),
    stageHistory: [{ stage: "IDEA", enteredAt: daysAgo(20), exitedAt: daysAgo(3) }],
  };
  const age = stageAgeDays(t, NOW_MS);
  check("no open current-stage row → falls back to createdAt (20d)", age === 20, `got ${age}`);
}

// Case 5: empty/absent stageHistory → createdAt fallback.
{
  const t = { stage: "ACTIVE", createdAt: daysAgo(7), stageHistory: [] };
  check("empty stageHistory → createdAt (7d)", stageAgeDays(t, NOW_MS) === 7, "mismatch");
}

// ── classify (buckets the read path hands to Dad/Mom) ────────────────────────

// Case 6: wide-overdue (31d > 14d) with no human touch → CLOSE.
{
  const t = { stage: "ACTIVE", dueDate: "2026-10-10", createdAt: daysAgo(50), stageHistory: [], history: [] };
  const { bucket } = classify(t, NOW_MS);
  check("overdue 31d, no human touch → CLOSE", bucket === "CLOSE", `got ${bucket}`);
}

// Case 7: same wide-overdue but a recent human edit (5d ago) → CONFIRM, never
// CLOSE — a just-prioritized task shouldn't be told it's probably dead.
{
  const t = {
    stage: "ACTIVE", dueDate: "2026-10-10", createdAt: daysAgo(50), stageHistory: [],
    history: [{ actor: "DAD", timestamp: daysAgo(5), change: "pulled in due date" }],
  };
  const { bucket } = classify(t, NOW_MS);
  check("overdue but human-touched 5d ago → CONFIRM (not CLOSE)", bucket === "CONFIRM", `got ${bucket}`);
}

// Case 8: no due date, open-stage age 100d (> 90d MOOT) → CONFIRM, never CLOSE
// (age alone isn't a moot signal). Relies on the keyless-open-row fix from Case 1.
{
  const t = {
    stage: "ACTIVE", createdAt: daysAgo(100),
    stageHistory: [{ stage: "ACTIVE", enteredAt: daysAgo(100) }], history: [],
  };
  const { bucket } = classify(t, NOW_MS);
  check("no due date, 100d stale → CONFIRM (age alone never CLOSE)", bucket === "CONFIRM", `got ${bucket}`);
}

// Case 9: snoozed into the future → KEEP (parked by design).
{
  const t = {
    stage: "IDEA", snoozedUntil: "2027-01-01", createdAt: daysAgo(100),
    stageHistory: [{ stage: "IDEA", enteredAt: daysAgo(100) }], history: [],
  };
  const { bucket } = classify(t, NOW_MS);
  check("snoozed into future → KEEP", bucket === "KEEP", `got ${bucket}`);
}

// Case 10: fresh (2d in stage, no due date) → KEEP.
{
  const t = {
    stage: "ACTIVE", createdAt: daysAgo(2),
    stageHistory: [{ stage: "ACTIVE", enteredAt: daysAgo(2) }], history: [],
  };
  const { bucket } = classify(t, NOW_MS);
  check("fresh 2d, no due date → KEEP", bucket === "KEEP", `got ${bucket}`);
}

console.log(`\n${failures === 0 ? "PASS" : "FAIL"} — test_staleness_triage.js (${failures} failure${failures === 1 ? "" : "s"})`);
process.exit(failures === 0 ? 0 : 1);
