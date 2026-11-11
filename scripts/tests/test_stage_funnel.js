#!/usr/bin/env node
/**
 * test_stage_funnel.js
 *
 * Tests the REAL production helpers in analytics/scripts/stage-funnel.js
 * (imports the module — no reimplementation, no file I/O).
 *
 * Anchor regression: the per-group breakdown tables (by category / by owner)
 * used to hardcode the columns IDEA|RESEARCH|ACTIVE|DONE. ASSIGNED is a
 * first-class stage (VALID_STAGES in board-tools/add.js & update.js; grouped
 * with ACTIVE as "open" by compose-brief.js), so an ASSIGNED task inflated a
 * group's Total while appearing in no column — the row counts silently did not
 * sum to Total (a hidden undercount). The fix derives columns from the full
 * stage vocabulary, so EVERY task lands in a column and columns always sum.
 */

'use strict';

const assert = require('assert');
const sf = require('../../analytics/scripts/stage-funnel.js');

let passed = 0;
const fail = [];
function check(name, cond) {
  if (cond) { passed++; } else { fail.push(name); }
}

// A board that exercises every canonical stage, including ASSIGNED and RESEARCH.
const TASKS = [
  { stage: 'IDEA',     category: 'ADMIN',  owner: 'DAD' },
  { stage: 'RESEARCH', category: 'ADMIN',  owner: 'DAD' },
  { stage: 'ACTIVE',   category: 'HOME',   owner: 'MOM' },
  { stage: 'ASSIGNED', category: 'HOME',   owner: 'MOM' },   // <-- the regression case
  { stage: 'ASSIGNED', category: 'ADMIN',  owner: 'DAD' },
  { stage: 'DONE',     category: 'FAMILY', owner: 'BOTH' },
  { stage: 'DONE',     category: 'ADMIN',  owner: 'DAD' },
];

// ── Stage vocabulary ──────────────────────────────────────────────────────────
check('STAGE_ORDER includes ASSIGNED', sf.STAGE_ORDER.includes('ASSIGNED'));
check('STAGE_ORDER is the full canonical set',
  ['IDEA', 'RESEARCH', 'ACTIVE', 'ASSIGNED', 'DONE'].every(s => sf.STAGE_ORDER.includes(s)));
check('WORKING_PLUS treats ASSIGNED as at/past ACTIVE', sf.WORKING_PLUS.includes('ASSIGNED'));

// ── stageColumns: no valid stage invisible, plus defensive catch-all ──────────
const cols = sf.stageColumns(TASKS);
check('stageColumns includes ASSIGNED', cols.includes('ASSIGNED'));
check('stageColumns includes RESEARCH', cols.includes('RESEARCH'));
check('stageColumns has no duplicates', cols.length === new Set(cols).size);

const withUnknown = sf.stageColumns([...TASKS, { stage: 'BACKLOG', category: 'X', owner: 'Y' }]);
check('stageColumns surfaces an unexpected observed stage (defensive)',
  withUnknown.includes('BACKLOG'));

// ── countByStage ──────────────────────────────────────────────────────────────
const counts = sf.countByStage(TASKS);
check('countByStage counts both ASSIGNED tasks', counts['ASSIGNED'] === 2);
check('countByStage counts DONE', counts['DONE'] === 2);

// ── ANCHOR: every breakdown row sums to its group Total ───────────────────────
// Parse the real markdown the production helper emits and assert the per-stage
// cells add up to the Total cell for every row. Under the old hardcoded columns
// the HOME and ADMIN rows (which hold ASSIGNED tasks) would fail this.
function rowsSumToTotal(keyFn, header) {
  const lines = sf.breakdownTable(TASKS, keyFn, header, cols);
  const dataRows = lines.slice(2); // skip header + separator
  let allOk = true;
  for (const line of dataRows) {
    const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
    // cells: [key, <one per column>, Total, Done%]
    const stageCells = cells.slice(1, 1 + cols.length).map(Number);
    const total = Number(cells[1 + cols.length]);
    const sum = stageCells.reduce((a, b) => a + b, 0);
    if (sum !== total) allOk = false;
  }
  return allOk;
}
check('by-category: every row sums stage columns to Total', rowsSumToTotal(t => t.category, 'Category'));
check('by-owner: every row sums stage columns to Total',   rowsSumToTotal(t => t.owner, 'Owner'));

// Specifically prove HOME (1 ACTIVE + 1 ASSIGNED = Total 2) is not undercounted.
const homeRow = sf.breakdownTable(TASKS, t => t.category, 'Category', cols)
  .find(l => l.startsWith('| HOME '));
const homeCells = homeRow.split('|').map(c => c.trim()).filter(c => c !== '');
check('HOME group Total is 2 (ACTIVE + ASSIGNED)', Number(homeCells[1 + cols.length]) === 2);
check('HOME ASSIGNED column shows 1 (not dropped)',
  Number(homeCells[1 + cols.indexOf('ASSIGNED')]) === 1);

// ── empty board degrades gracefully ───────────────────────────────────────────
check('stageColumns on empty board still returns canonical set',
  sf.stageColumns([]).length === sf.STAGE_ORDER.length);

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\ntest_stage_funnel: ${passed} passed, ${fail.length} failed`);
if (fail.length) {
  console.log('FAILED:');
  for (const f of fail) console.log('  - ' + f);
  process.exit(1);
}
console.log('All assertions passed.');
