#!/usr/bin/env node
/**
 * completion-rate.js — Task completion rate analysis
 *
 * Answers: What % of tasks reach DONE, broken down by category, owner, source,
 * taskType, and priority? Also computes median lead time for completed tasks.
 *
 * Usage:
 *   node analytics/scripts/completion-rate.js
 *   node analytics/scripts/completion-rate.js --json
 *   node analytics/scripts/completion-rate.js --save   (writes analytics/outputs/completion-rate.md)
 */

'use strict';

const path = require('path');
const fs = require('fs');

const BOARD_PATH = path.join(__dirname, '../../board-data.json');
const OUTPUTS_DIR = path.join(__dirname, '../outputs');

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}

function median(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function msDays(ms) {
  return +(ms / (1000 * 60 * 60 * 24)).toFixed(1);
}

// Lead time (days) for a completed task, or null if it can't be computed or is
// negative. completedAt < createdAt is a data error (e.g. a hand-edited or
// bulk-imported timestamp); a negative lead time is never meaningful, so it is
// dropped here — both the overall stats and the per-dimension breakdown route
// through this one function so they stay consistent.
function leadDays(t) {
  if (!t.completedAt || !t.createdAt) return null;
  const days = msDays(new Date(t.completedAt) - new Date(t.createdAt));
  return days >= 0 ? days : null;
}

function ratesByDimension(tasks, field) {
  const groups = {};
  tasks.forEach(t => {
    const key = t[field] || 'unknown';
    if (!groups[key]) groups[key] = { total: 0, done: 0, leadTimes: [] };
    groups[key].total++;
    if (t.stage === 'DONE') {
      groups[key].done++;
      const days = leadDays(t);
      if (days != null) groups[key].leadTimes.push(days);
    }
  });

  return Object.entries(groups)
    .map(([key, g]) => ({
      [field]: key,
      total: g.total,
      done: g.done,
      rate: g.total > 0 ? Math.round((g.done / g.total) * 100) : 0,
      medianLeadDays: median(g.leadTimes),
    }))
    .sort((a, b) => b.rate - a.rate);
}

// Pure: given a board object and a timestamp, produce the full report object.
// No I/O, no process.argv — safe to require() and unit-test.
function computeReport(board, now) {
  // Exclude ARCHIVED tasks from rate analysis — they were removed, not completed
  const tasks = (board.tasks || []).filter(t => t.stage !== 'ARCHIVED');

  const done = tasks.filter(t => t.stage === 'DONE');

  // Overall rate
  const overall = {
    total: tasks.length,
    done: done.length,
    rate: tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0,
  };

  // Lead times for DONE tasks (negative/invalid dropped — see leadDays)
  const leadTimes = done.map(leadDays).filter(d => d != null);

  const leadTimeStats = {
    count: leadTimes.length,
    medianDays: median(leadTimes),
    minDays: leadTimes.length > 0 ? Math.min(...leadTimes) : null,
    maxDays: leadTimes.length > 0 ? Math.max(...leadTimes) : null,
  };

  return {
    generatedAt: new Date(now).toISOString(),
    overall,
    leadTimeStats,
    byCategory: ratesByDimension(tasks, 'category'),
    byOwner: ratesByDimension(tasks, 'owner'),
    bySource: ratesByDimension(tasks, 'source'),
    byTaskType: ratesByDimension(tasks, 'taskType'),
    byPriority: ratesByDimension(tasks, 'priority'),
  };
}

function renderMarkdown(report, now) {
  const { overall, leadTimeStats } = report;
  const lines = [];
  const ts = new Date(now).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  lines.push(`# Completion Rate Report — ${ts}`);
  lines.push('');
  lines.push(`_${overall.total} total tasks (excl. archived), ${overall.done} done — overall rate: **${overall.rate}%**_`);
  lines.push('');

  if (leadTimeStats.count > 0) {
    lines.push(`Lead time (creation → done): median **${leadTimeStats.medianDays} days**, min ${leadTimeStats.minDays}d, max ${leadTimeStats.maxDays}d (n=${leadTimeStats.count})`);
    lines.push('');
  }

  function tableSection(title, rows, field) {
    lines.push(`## By ${title}`);
    lines.push('');
    lines.push(`| ${title} | Done | Total | Rate | Median Lead (days) |`);
    lines.push(`|---------|------|-------|------|--------------------|`);
    rows.forEach(r => {
      const lead = r.medianLeadDays != null ? r.medianLeadDays : '—';
      lines.push(`| ${r[field]} | ${r.done} | ${r.total} | ${r.rate}% | ${lead} |`);
    });
    lines.push('');
  }

  tableSection('Category', report.byCategory, 'category');
  tableSection('Owner', report.byOwner, 'owner');
  tableSection('Source', report.bySource, 'source');
  tableSection('Task Type', report.byTaskType, 'taskType');
  tableSection('Priority', report.byPriority, 'priority');

  // Interpretation notes
  lines.push('## Notes');
  lines.push('');
  lines.push('- Lead time is measured from `createdAt` to `completedAt` and includes waiting time.');
  lines.push('- ARCHIVED tasks are excluded (they were removed, not completed).');
  lines.push(`- Dataset is small (${overall.done} completed tasks). Rates will become meaningful at 25+ completions.`);
  lines.push('');

  return lines.join('\n');
}

function run() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const doSave = args.includes('--save');

  const board = loadBoard();
  const now = Date.now();
  const report = computeReport(board, now);

  if (asJson) {
    const out = JSON.stringify(report, null, 2);
    if (doSave) {
      const p = path.join(OUTPUTS_DIR, 'completion-rate.json');
      fs.writeFileSync(p, out);
      console.error(`Saved to ${p}`);
    }
    console.log(out);
    return;
  }

  const md = renderMarkdown(report, now);

  if (doSave) {
    const p = path.join(OUTPUTS_DIR, 'completion-rate.md');
    fs.writeFileSync(p, md);
    console.error(`Saved to ${p}`);
  }

  console.log(md);
}

module.exports = { computeReport, renderMarkdown, ratesByDimension, leadDays, median, msDays, loadBoard };

if (require.main === module) {
  run();
}
