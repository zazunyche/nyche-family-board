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

const STAGE_ORDER = ['IDEA', 'RESEARCH', 'ACTIVE', 'DONE'];

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}

function pct(n, d) {
  if (!d) return '—';
  return `${Math.round((n / d) * 100)}%`;
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
  const active  = tasks.filter(t => ['ACTIVE', 'DONE'].includes(t.stage)).length;
  const done    = tasks.filter(t => t.stage === 'DONE').length;

  lines.push(`- IDEA → moved forward: **${pct(notIdea, total)}** (${notIdea}/${total})`);
  lines.push(`- Entered ACTIVE or DONE: **${pct(active, total)}** (${active}/${total})`);
  lines.push(`- Reached DONE: **${pct(done, total)}** (${done}/${total})`);
  lines.push(`- ACTIVE → DONE (of those that went ACTIVE): **${pct(done, active)}** (${done}/${active})`);
  lines.push('');

  // ── By category funnel ────────────────────────────────────────────────────────
  lines.push('## Stage Distribution by Category');
  lines.push('');
  lines.push('| Category | IDEA | RESEARCH | ACTIVE | DONE | Total | Done% |');
  lines.push('|----------|------|----------|--------|------|-------|-------|');

  const categories = [...new Set(tasks.map(t => t.category || 'UNKNOWN'))].sort();
  for (const cat of categories) {
    const catTasks = tasks.filter(t => t.category === cat);
    const counts = {};
    for (const t of catTasks) counts[t.stage] = (counts[t.stage] || 0) + 1;
    const catTotal = catTasks.length;
    const catDone  = counts['DONE'] || 0;
    lines.push(`| ${cat} | ${counts['IDEA']||0} | ${counts['RESEARCH']||0} | ${counts['ACTIVE']||0} | ${catDone} | ${catTotal} | ${pct(catDone, catTotal)} |`);
  }
  lines.push('');

  // ── By owner funnel ───────────────────────────────────────────────────────────
  lines.push('## Stage Distribution by Owner');
  lines.push('');
  lines.push('| Owner | IDEA | RESEARCH | ACTIVE | DONE | Total | Done% |');
  lines.push('|-------|------|----------|--------|------|-------|-------|');

  const ownerList = [...new Set(tasks.map(t => t.owner || 'UNKNOWN'))].sort();
  for (const owner of ownerList) {
    const ownerTasks = tasks.filter(t => t.owner === owner);
    const counts = {};
    for (const t of ownerTasks) counts[t.stage] = (counts[t.stage] || 0) + 1;
    const ownerTotal = ownerTasks.length;
    const ownerDone  = counts['DONE'] || 0;
    lines.push(`| ${owner} | ${counts['IDEA']||0} | ${counts['RESEARCH']||0} | ${counts['ACTIVE']||0} | ${ownerDone} | ${ownerTotal} | ${pct(ownerDone, ownerTotal)} |`);
  }
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

run();
