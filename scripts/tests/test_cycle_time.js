#!/usr/bin/env node
/**
 * test_cycle_time.js
 *
 * Tests the REAL production helpers in analytics/scripts/cycle-time.js by
 * require()-ing the module (no reimplementation, no file I/O). cycle-time.js was
 * the last of the four stageHistory walkers (board-health / staleness-triage /
 * wait-ratio were already covered) with no regression suite — this closes that
 * gap. The 2026-11-11 refactor extracted a pure computeReport(board, now) and
 * exported the math helpers behind a require.main guard so they can be driven
 * here deterministically.
 *
 * Anchor regressions pinned:
 *  1. Stage-dwell stats key on each entry's stored durationMs and count ONLY
 *     entries with durationMs > 0. Open stage entries (active stage: durationMs
 *     null OR the key absent entirely — the two open-entry shapes) and
 *     zero-duration instant transitions MUST be excluded, so dwell reflects only
 *     completed stage transitions. A future refactor that switches to live
 *     enteredAt/exitedAt math (reintroducing the open-entry shape bug) or that
 *     loosens the `> 0` guard would flip these counts and fail here.
 *  2. Lead time is completedAt − createdAt; DONE tasks missing either field are
 *     excluded (not charged a bogus lead time).
 *  3. Active-task age is measured from createdAt against the injected `now`.
 */

'use strict';

const assert = require('assert');
const ct = require('../../analytics/scripts/cycle-time.js');

let passed = 0;
const fail = [];
function check(name, cond) {
  if (cond) { passed++; } else { fail.push(name); }
}

const DAY = 24 * 60 * 60 * 1000;
const T0  = Date.parse('2026-01-01T00:00:00.000Z');
const d   = n => new Date(T0 + n * DAY).toISOString();

// ── Pure helper math ─────────────────────────────────────────────────────────
check('msDays(1 day) === 1',        ct.msDays(DAY) === 1);
check('msDays(0) === 0',            ct.msDays(0) === 0);
check('msDays rounds to 0.1d',      ct.msDays(DAY * 1.25) === 1.3); // 1.25 → 1.3 (half-up)

check('median([]) is null',         ct.median([]) === null);
check('median odd picks middle',    ct.median([10 * DAY, 30 * DAY, 20 * DAY]) === 20);
check('median even averages pair',  ct.median([10 * DAY, 20 * DAY]) === 15);

const sEmpty = ct.statsRow([]);
check('statsRow([]) n=0',           sEmpty.n === 0);
check('statsRow([]) median null',   sEmpty.median === null);
check('statsRow([]) min/max null',  sEmpty.min === null && sEmpty.max === null);

const sVals = ct.statsRow([30 * DAY, 10 * DAY, 20 * DAY]);
check('statsRow n counts all',      sVals.n === 3);
check('statsRow median',            sVals.median === 20);
check('statsRow min is smallest',   sVals.min === 10);
check('statsRow max is largest',    sVals.max === 30);

check('dateStr slices to YYYY-MM-DD', ct.dateStr('2026-01-15T09:00:00.000Z') === '2026-01-15');
check('dateStr of null is em-dash',   ct.dateStr(null) === '—');

// ── Integration: computeReport over a synthetic board ────────────────────────
const NOW = T0 + 50 * DAY;

const board = {
  tasks: [
    // DONE tasks drive lead time (completedAt − createdAt).
    { id: 'd1', title: 'Done A', category: 'ADMIN', owner: 'DAD', stage: 'DONE',
      taskType: 'ERRAND', createdAt: d(0), completedAt: d(10) },   // 10d
    { id: 'd2', title: 'Done B', category: 'ADMIN', owner: 'MOM', stage: 'DONE',
      taskType: 'ERRAND', createdAt: d(0), completedAt: d(20) },   // 20d
    { id: 'd3', title: 'Done C', category: 'HOME', owner: 'DAD', stage: 'DONE',
      taskType: 'MAINTENANCE', createdAt: d(0), completedAt: d(30) }, // 30d
    // DONE but missing completedAt → excluded from lead time (and from active age).
    { id: 'd4', title: 'Done no-completedAt', category: 'ADMIN', owner: 'DAD',
      stage: 'DONE', createdAt: d(0), completedAt: null },
    // Active task → age from createdAt vs NOW (50d).
    { id: 'a1', title: 'Active goal task', category: 'GOALS', owner: 'DAD',
      stage: 'ACTIVE', effortTag: 'M', createdAt: d(0) },
    // ── Stage-dwell fixtures (need stageHistory.length > 1). Kept DONE with no
    //    completedAt so they do NOT leak into lead-time or active-age sections. ──
    { id: 'h1', title: 'Hist closed', stage: 'DONE', createdAt: d(0), completedAt: null,
      stageHistory: [
        { stage: 'IDEA',   enteredAt: d(0), exitedAt: d(2), durationMs: 2 * DAY },
        { stage: 'ACTIVE', enteredAt: d(2), exitedAt: d(6), durationMs: 4 * DAY },
      ] },
    { id: 'h2', title: 'Hist open ACTIVE (null durationMs key absent)', stage: 'DONE',
      createdAt: d(0), completedAt: null,
      stageHistory: [
        { stage: 'IDEA',   enteredAt: d(0), exitedAt: d(5), durationMs: 5 * DAY },
        { stage: 'ACTIVE', enteredAt: d(5), exitedAt: null },  // open: no durationMs → MUST be excluded
      ] },
    { id: 'h3', title: 'Hist zero-duration IDEA', stage: 'DONE',
      createdAt: d(0), completedAt: null,
      stageHistory: [
        { stage: 'IDEA',   enteredAt: d(0), exitedAt: d(0), durationMs: 0 },       // instant → excluded
        { stage: 'ACTIVE', enteredAt: d(0), exitedAt: d(3), durationMs: 3 * DAY },
      ] },
  ],
};

const out = ct.computeReport(board, NOW);

// Overall lead time: [10, 20, 30] → median 20, min 10, max 30; d4 excluded (n=3).
check('overall counts only DONE w/ completedAt (n=3)', out.includes('| Completed tasks | 3 |'));
check('overall median lead = 20d',                     out.includes('| Median | 20d |'));
check('overall min lead = 10d',                        out.includes('| Min    | 10d |'));
check('overall max lead = 30d',                        out.includes('| Max    | 30d |'));

// ADMIN category: d1(10), d2(20) → median 15, min 10, max 20 (d4 excluded, no completedAt).
check('ADMIN category row median 15d',  out.includes('| ADMIN | 2 | 15d | 10d | 20d |'));

// Active age: a1 created d(0), now = 50d → 50d, effortTag M.
check('active task age = 50d from createdAt', out.includes('| 50d | M |'));

// ── Dwell anchor: open + zero-duration entries excluded ──────────────────────
// IDEA dwell pool = {h1:2d, h2:5d}  (h3's 0d excluded) → n=2, median 3.5, min 2, max 5.
// ACTIVE dwell pool = {h1:4d, h3:3d} (h2's open entry excluded) → n=2, median 3.5, min 3, max 4.
check('IDEA dwell excludes zero-duration (n=2)',   out.includes('| IDEA | 2 | 3.5d | 2d | 5d |'));
check('ACTIVE dwell excludes open entry (n=2)',    out.includes('| ACTIVE | 2 | 3.5d | 3d | 4d |'));
// Regression teeth: if the open ACTIVE entry were (wrongly) counted, ACTIVE n would be 3
// and the stats would shift — assert the broken row never appears.
check('no inflated ACTIVE dwell row (n=3)',        !out.includes('| ACTIVE | 3 |'));

console.log('');
console.log(`test_cycle_time: ${passed} passed, ${fail.length} failed`);
if (fail.length) {
  fail.forEach(f => console.log(`  [FAIL] ${f}`));
  process.exit(1);
}
assert.strictEqual(fail.length, 0);
console.log('All assertions passed — lead time = completedAt−createdAt (incomplete DONE ' +
  'excluded); active age from createdAt; stage-dwell counts only completed transitions ' +
  '(open + zero-duration stage entries excluded).');
