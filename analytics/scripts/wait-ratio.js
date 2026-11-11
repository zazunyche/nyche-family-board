#!/usr/bin/env node
/**
 * wait-ratio.js — How much of each task's life is active work vs. idle waiting?
 *
 * wait ratio = wait time / total tracked time
 * cycle time = sum of durationMs for stages where work actually happens (ACTIVE, ASSIGNED)
 * wait time  = sum of durationMs for non-work, non-terminal stages (IDEA, RESEARCH)
 *
 * Terminal stages (DONE, ARCHIVED) are NOT counted: time spent after a task is
 * finished is neither cycle nor wait — the task is no longer alive. This matters
 * because DONE is terminal and its stageHistory entry stays open (exitedAt: null),
 * so counting it would charge every completed task months of phantom "wait" that
 * grows with each run (end = now), pushing its ratio spuriously toward 100%.
 *
 * Only tasks with a usable stageHistory (>=1 entry, enteredAt set) are included.
 * For the current (open) non-terminal stage, elapsed time is computed as now - enteredAt.
 *
 * Usage:
 *   node analytics/scripts/wait-ratio.js
 *   node analytics/scripts/wait-ratio.js --save   (writes to analytics/outputs/wait-ratio.md)
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const BOARD_PATH  = path.join(__dirname, '../../board-data.json');
const OUTPUTS_DIR = path.join(__dirname, '../outputs');

const WORK_STAGES     = new Set(['ACTIVE', 'ASSIGNED']);
// Terminal stages are excluded from the time budget entirely — time after a task
// finishes is not part of its lead time. DONE/ARCHIVED mirror board-health.js and
// the other analytics scripts' terminal-stage convention.
const TERMINAL_STAGES = new Set(['DONE', 'ARCHIVED']);

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}

function pct(n) {
  return n == null ? '—' : `${Math.round(n * 1000) / 10}%`;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Sum elapsed ms per stage bucket (work vs wait), filling in the open stage with now().
function taskStageMs(task, now) {
  const hist = task.stageHistory || [];
  if (!hist.length) return null;

  let workMs = 0;
  let waitMs = 0;
  let totalMs = 0;

  for (const entry of hist) {
    if (!entry.enteredAt) continue;
    // Skip terminal stages: post-completion time is neither work nor wait, and
    // the open DONE entry (exitedAt: null) would otherwise charge end=now forever.
    if (TERMINAL_STAGES.has(entry.stage)) continue;
    const start = new Date(entry.enteredAt).getTime();
    const end   = entry.exitedAt ? new Date(entry.exitedAt).getTime() : now;
    const dur   = Math.max(0, end - start);
    totalMs += dur;
    if (WORK_STAGES.has(entry.stage)) workMs += dur;
    else waitMs += dur;
  }

  if (totalMs === 0) return null;
  return { workMs, waitMs, totalMs, waitRatio: waitMs / totalMs };
}

function run() {
  const board = loadBoard();
  const tasks = board.tasks || [];
  const now   = Date.now();
  const reportDate = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  const withRatio = tasks
    .map(t => ({ task: t, m: taskStageMs(t, now) }))
    .filter(r => r.m !== null);

  const lines = [];
  lines.push(`# Wait Ratio Report — ${reportDate}`);
  lines.push('');
  lines.push(`_${withRatio.length} of ${tasks.length} tasks have usable stageHistory. ` +
    `Wait ratio = time in IDEA/RESEARCH ÷ total tracked time. Work stages = ACTIVE/ASSIGNED. ` +
    `Terminal stages (DONE/ARCHIVED) are excluded — post-completion time is not counted._`);
  lines.push('');

  // ── Overall ──────────────────────────────────────────────────────────────────
  const allRatios = withRatio.map(r => r.m.waitRatio);
  lines.push('## Overall');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Tasks analyzed | ${withRatio.length} |`);
  lines.push(`| Average wait ratio | ${pct(avg(allRatios))} |`);
  lines.push(`| Median wait ratio | ${pct(median(allRatios))} |`);
  lines.push('');

  // ── By category ──────────────────────────────────────────────────────────────
  lines.push('## Wait Ratio by Category');
  lines.push('');
  lines.push('| Category | n | Avg wait ratio | Median wait ratio |');
  lines.push('|----------|---|----------------|--------------------|');

  const cats = [...new Set(withRatio.map(r => r.task.category || 'UNKNOWN'))].sort();
  for (const cat of cats) {
    const ratios = withRatio.filter(r => (r.task.category || 'UNKNOWN') === cat).map(r => r.m.waitRatio);
    lines.push(`| ${cat} | ${ratios.length} | ${pct(avg(ratios))} | ${pct(median(ratios))} |`);
  }
  lines.push('');

  // ── DONE vs still-open ───────────────────────────────────────────────────────
  const doneRatios = withRatio.filter(r => r.task.stage === 'DONE').map(r => r.m.waitRatio);
  const openRatios = withRatio.filter(r => r.task.stage !== 'DONE').map(r => r.m.waitRatio);
  lines.push('## DONE vs. Still-Open Tasks');
  lines.push('');
  lines.push('| Group | n | Avg wait ratio | Median wait ratio |');
  lines.push('|-------|---|----------------|--------------------|');
  lines.push(`| DONE | ${doneRatios.length} | ${pct(avg(doneRatios))} | ${pct(median(doneRatios))} |`);
  lines.push(`| Still open | ${openRatios.length} | ${pct(avg(openRatios))} | ${pct(median(openRatios))} |`);
  lines.push('');

  // ── Highest wait-ratio open tasks (most idle, least worked) ─────────────────
  lines.push('## Highest Wait Ratio — Open Tasks (idle the longest relative to effort)');
  lines.push('');
  lines.push('| Task | Category | Stage | Wait Ratio | Total Tracked |');
  lines.push('|------|----------|-------|------------|----------------|');

  const openSorted = withRatio
    .filter(r => r.task.stage !== 'DONE')
    .sort((a, b) => b.m.waitRatio - a.m.waitRatio)
    .slice(0, 10);

  for (const r of openSorted) {
    const title = r.task.title.length > 45 ? r.task.title.slice(0, 42) + '…' : r.task.title;
    const totalDays = Math.round((r.m.totalMs / (1000 * 60 * 60 * 24)) * 10) / 10;
    lines.push(`| ${title} | ${r.task.category || '—'} | ${r.task.stage} | ${pct(r.m.waitRatio)} | ${totalDays}d |`);
  }
  lines.push('');

  const report = lines.join('\n');

  if (process.argv.includes('--save')) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
    const outPath = path.join(OUTPUTS_DIR, 'wait-ratio.md');
    fs.writeFileSync(outPath, report);
    console.log(`Saved to ${outPath}`);
  } else {
    console.log(report);
  }
}

module.exports = { WORK_STAGES, TERMINAL_STAGES, taskStageMs, median, avg, pct };

if (require.main === module) {
  run();
}
