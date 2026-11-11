#!/usr/bin/env node
/**
 * stage-funnel.js — Stage funnel and conversion rate analysis
 *
 * Counts tasks at each stage, calculates stage-to-stage flow rates,
 * identifies where tasks are piling up, and surfaces completion quality breakdown.
 *
 * Usage:
 *   node analytics/scripts/stage-funnel.js
 *   node analytics/scripts/stage-funnel.js --save   (writes to analytics/outputs/stage-funnel.md)
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const BOARD_PATH  = path.join(__dirname, '../../board-data.json');
const OUTPUTS_DIR = path.join(__dirname, '../outputs');

// Full canonical stage vocabulary (matches VALID_STAGES in board-tools/add.js
// and update.js). ASSIGNED and RESEARCH are first-class stages — ASSIGNED is
// grouped with ACTIVE as an open/working stage by compose-brief.js. Keeping this
// list complete is what prevents a valid stage from going invisible in the
// per-group tables below (an undercount that leaves row columns not summing to
// Total). "Entered working" counts any stage at or past ACTIVE.
const STAGE_ORDER  = ['IDEA', 'RESEARCH', 'ACTIVE', 'ASSIGNED', 'DONE'];
const WORKING_PLUS = ['ACTIVE', 'ASSIGNED', 'DONE'];

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}

function pct(n, d) {
  if (!d) return '—';
  return `${Math.round((n / d) * 100)}%`;
}

// Column set for the per-group breakdown tables: the canonical vocabulary, plus
// any stage actually present in the data that isn't already listed (defensive,
// mirrors the Stage Distribution section). Guarantees every task lands in a
// column, so per-stage counts always sum to the group total.
function stageColumns(tasks) {
  const seen = new Set();
  for (const t of tasks) if (t && t.stage) seen.add(t.stage);
  return [...new Set([...STAGE_ORDER, ...seen])];
}

function countByStage(tasks) {
  const counts = {};
  for (const t of tasks) counts[t.stage] = (counts[t.stage] || 0) + 1;
  return counts;
}

// One breakdown table (by category or by owner). Columns are the full stage
// vocabulary so no valid stage is ever dropped; returns markdown lines.
function breakdownTable(tasks, keyFn, keyHeader, columns) {
  const lines = [];
  lines.push(`| ${keyHeader} | ${columns.join(' | ')} | Total | Done% |`);
  lines.push(`|${'----|'.repeat(columns.length + 3)}`);
  const keys = [...new Set(tasks.map(t => keyFn(t) || 'UNKNOWN'))].sort();
  for (const key of keys) {
    const groupTasks = tasks.filter(t => (keyFn(t) || 'UNKNOWN') === key);
    const counts = countByStage(groupTasks);
    const cells  = columns.map(s => counts[s] || 0).join(' | ');
    const total  = groupTasks.length;
    const done   = counts['DONE'] || 0;
    lines.push(`| ${key} | ${cells} | ${total} | ${pct(done, total)} |`);
  }
  return lines;
}

function run() {
  const board = loadBoard();
  const tasks = board.tasks || [];
  const reportDate = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  const lines = [];
  lines.push(`# Stage Funnel — ${reportDate}`);
  lines.push('');
  lines.push(`_${tasks.length} total tasks_`);
  lines.push('');

  // ── Overall stage distribution ────────────────────────────────────────────────
  lines.push('## Stage Distribution');
  lines.push('');
  lines.push('| Stage | Count | % of total |');
  lines.push('|-------|-------|------------|');

  const stageCounts = {};
  for (const t of tasks) {
    stageCounts[t.stage] = (stageCounts[t.stage] || 0) + 1;
  }

  const allStages = [...new Set([...STAGE_ORDER, ...Object.keys(stageCounts)])];
  for (const stage of allStages) {
    const n = stageCounts[stage] || 0;
    lines.push(`| ${stage} | ${n} | ${pct(n, tasks.length)} |`);
  }
  lines.push('');

  // ── Funnel conversion rates ───────────────────────────────────────────────────
  lines.push('## Funnel Conversion (top-of-funnel → done)');
  lines.push('');
  const total   = tasks.length;
  const notIdea = tasks.filter(t => t.stage !== 'IDEA').length;
  const active  = tasks.filter(t => WORKING_PLUS.includes(t.stage)).length;
  const done    = tasks.filter(t => t.stage === 'DONE').length;

  lines.push(`- IDEA → moved forward: **${pct(notIdea, total)}** (${notIdea}/${total})`);
  lines.push(`- Entered ACTIVE/ASSIGNED or DONE: **${pct(active, total)}** (${active}/${total})`);
  lines.push(`- Reached DONE: **${pct(done, total)}** (${done}/${total})`);
  lines.push(`- Working → DONE (of those that went ACTIVE/ASSIGNED): **${pct(done, active)}** (${done}/${active})`);
  lines.push('');

  const columns = stageColumns(tasks);

  // ── By category funnel ────────────────────────────────────────────────────────
  lines.push('## Stage Distribution by Category');
  lines.push('');
  lines.push(...breakdownTable(tasks, t => t.category, 'Category', columns));
  lines.push('');

  // ── By owner funnel ───────────────────────────────────────────────────────────
  lines.push('## Stage Distribution by Owner');
  lines.push('');
  lines.push(...breakdownTable(tasks, t => t.owner, 'Owner', columns));
  lines.push('');

  // ── Completion quality breakdown ──────────────────────────────────────────────
  const doneWithQuality = tasks.filter(t => t.stage === 'DONE' && t.completionQuality);
  if (doneWithQuality.length > 0) {
    lines.push('## Completion Quality (DONE tasks)');
    lines.push('');
    lines.push('| Quality | Count | % of done |');
    lines.push('|---------|-------|-----------|');
    const qCounts = {};
    for (const t of doneWithQuality) qCounts[t.completionQuality] = (qCounts[t.completionQuality] || 0) + 1;
    for (const [q, n] of Object.entries(qCounts).sort()) {
      lines.push(`| ${q} | ${n} | ${pct(n, done)} |`);
    }
    const genuineDone = (qCounts['FULL'] || 0) + (qCounts['DELEGATED_OUT'] || 0);
    lines.push('');
    lines.push(`_Genuine completion rate (FULL + DELEGATED_OUT): **${pct(genuineDone, done)}** of done tasks_`);
    lines.push('');
  }

  // ── Resistance signals ────────────────────────────────────────────────────────
  const resistant = tasks.filter(t => t.stage !== 'DONE' && (t.resistanceScore || 0) > 0)
    .sort((a, b) => (b.resistanceScore || 0) - (a.resistanceScore || 0));
  if (resistant.length > 0) {
    lines.push('## Resistance Signals (non-zero resistanceScore)');
    lines.push('');
    lines.push('| Task | Score | Briefs | Stage |');
    lines.push('|------|-------|--------|-------|');
    for (const t of resistant) {
      const title = t.title.length > 45 ? t.title.slice(0, 42) + '…' : t.title;
      lines.push(`| ${title} | ${t.resistanceScore} | ${t.briefCount || 0} | ${t.stage} |`);
    }
    lines.push('');
  }

  const report = lines.join('\n');

  if (process.argv.includes('--save')) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
    const outPath = path.join(OUTPUTS_DIR, 'stage-funnel.md');
    fs.writeFileSync(outPath, report);
    console.log(`Saved to ${outPath}`);
  } else {
    console.log(report);
  }
}

module.exports = { STAGE_ORDER, WORKING_PLUS, stageColumns, countByStage, breakdownTable, pct };

if (require.main === module) run();
