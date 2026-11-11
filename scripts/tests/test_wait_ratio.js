#!/usr/bin/env node
/**
 * test_wait_ratio.js
 *
 * Tests the REAL production helper taskStageMs() in analytics/scripts/wait-ratio.js
 * (imports the module — no reimplementation, no file I/O).
 *
 * Anchor regression: taskStageMs() bucketed every non-work stage into waitMs,
 * including the TERMINAL stages. DONE is terminal and its stageHistory entry
 * stays OPEN (exitedAt: null), so end = now — every completed task accrued
 * post-completion time as "wait," growing with each run and pushing its wait
 * ratio spuriously toward 100%. (On the live board, 36 of 51 DONE tasks had an
 * open DONE entry; the oldest had charged 42+ days of phantom wait.) The fix
 * skips TERMINAL_STAGES (DONE/ARCHIVED) entirely so the ratio reflects only the
 * task's pre-completion life.
 */

'use strict';

const assert = require('assert');
const wr = require('../../analytics/scripts/wait-ratio.js');

let passed = 0;
const fail = [];
function check(name, cond) {
  if (cond) { passed++; } else { fail.push(name); }
}

const DAY = 24 * 60 * 60 * 1000;
const T0  = Date.parse('2026-01-01T00:00:00.000Z');
const d   = n => new Date(T0 + n * DAY).toISOString();

// A task that waited 10d in IDEA, worked 5d in ACTIVE, then has sat in DONE for
// 100 days (DONE entry still open, exitedAt: null). "now" is 115 days after T0.
const NOW = T0 + 115 * DAY;
const COMPLETED = {
  stage: 'DONE',
  stageHistory: [
    { stage: 'IDEA',   enteredAt: d(0),  exitedAt: d(10) },   // 10d wait
    { stage: 'ACTIVE', enteredAt: d(10), exitedAt: d(15) },   // 5d work
    { stage: 'DONE',   enteredAt: d(15), exitedAt: null  },   // 100d terminal — MUST be ignored
  ],
};

const m = wr.taskStageMs(COMPLETED, NOW);

// Terminal DONE time is excluded: total tracked = 15d (not 115d).
check('total tracked excludes terminal DONE time', Math.round(m.totalMs / DAY) === 15);
check('wait time = 10d (IDEA only, not DONE)',       Math.round(m.waitMs / DAY) === 10);
check('work time = 5d (ACTIVE)',                     Math.round(m.workMs / DAY) === 5);
check('wait ratio = 10/15 ≈ 0.667',                  Math.abs(m.waitRatio - (10 / 15)) < 1e-6);
// Regression guard: without the fix, DONE's 100 open days would dominate and drive
// the ratio toward 1. Pin it well below that.
check('wait ratio is NOT inflated toward 1',         m.waitRatio < 0.8);

// ASSIGNED counts as work (not wait), same as ACTIVE.
const ASSIGNED_TASK = {
  stage: 'DONE',
  stageHistory: [
    { stage: 'RESEARCH', enteredAt: d(0), exitedAt: d(4)  },  // 4d wait
    { stage: 'ASSIGNED', enteredAt: d(4), exitedAt: d(10) },  // 6d work
    { stage: 'DONE',     enteredAt: d(10), exitedAt: null },  // terminal — ignored
  ],
};
const ma = wr.taskStageMs(ASSIGNED_TASK, NOW);
check('ASSIGNED counted as work',          Math.round(ma.workMs / DAY) === 6);
check('RESEARCH counted as wait',          Math.round(ma.waitMs / DAY) === 4);
check('ASSIGNED total excludes DONE',      Math.round(ma.totalMs / DAY) === 10);

// An open NON-terminal stage still accrues to now (ACTIVE task in flight).
const OPEN_ACTIVE = {
  stage: 'ACTIVE',
  stageHistory: [
    { stage: 'IDEA',   enteredAt: d(100), exitedAt: d(105) }, // 5d wait
    { stage: 'ACTIVE', enteredAt: d(105), exitedAt: null   }, // open → to now (10d)
  ],
};
const mo = wr.taskStageMs(OPEN_ACTIVE, NOW);
check('open ACTIVE accrues to now',        Math.round(mo.workMs / DAY) === 10);
check('open ACTIVE total = 15d',           Math.round(mo.totalMs / DAY) === 15);

// ARCHIVED is terminal too.
const ARCHIVED_TASK = {
  stage: 'ARCHIVED',
  stageHistory: [
    { stage: 'IDEA',     enteredAt: d(0), exitedAt: d(3)  },
    { stage: 'ARCHIVED', enteredAt: d(3), exitedAt: null  }, // terminal — ignored
  ],
};
const mar = wr.taskStageMs(ARCHIVED_TASK, NOW);
check('ARCHIVED excluded from total', Math.round(mar.totalMs / DAY) === 3);

// A task whose ONLY tracked time is terminal yields null (no usable budget).
const ONLY_DONE = {
  stage: 'DONE',
  stageHistory: [{ stage: 'DONE', enteredAt: d(0), exitedAt: null }],
};
check('all-terminal history → null', wr.taskStageMs(ONLY_DONE, NOW) === null);

// Empty / missing history → null.
check('no stageHistory → null', wr.taskStageMs({ stageHistory: [] }, NOW) === null);

console.log('');
console.log(`test_wait_ratio: ${passed} passed, ${fail.length} failed`);
if (fail.length) {
  fail.forEach(f => console.log(`  [FAIL] ${f}`));
  process.exit(1);
}
assert.strictEqual(fail.length, 0);
console.log('All assertions passed — terminal (DONE/ARCHIVED) time is excluded; ' +
  'ACTIVE/ASSIGNED count as work; IDEA/RESEARCH as wait; open non-terminal stages accrue to now.');
