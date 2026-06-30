#!/usr/bin/env node
/**
 * wait-ratio.js — How much of each task's life is active work vs. idle waiting?
 *
 * wait ratio = (lead time - cycle time) / lead time
 * cycle time = sum of durationMs for stages where work actually happens (ACTIVE)
 * wait time  = sum of durationMs for non-work stages (IDEA, RESEARCH)
 *
 * Only tasks with a usable stageHistory (>=1 entry, enteredAt set) are included.
 * For the current (open) stage, elapsed time is computed as now - enteredAt.
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

const WORK_STAGES = new Set(['ACTIVE', 'ASSIGNED']);

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
    `Wait ratio = time in IDEA/RESEARCH ÷ total time tracked. Work stage = ACTIVE._`);
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

run();
