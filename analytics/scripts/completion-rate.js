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

function ratesByDimension(tasks, field) {
  const groups = {};
  tasks.forEach(t => {
    const key = t[field] || 'unknown';
    if (!groups[key]) groups[key] = { total: 0, done: 0, leadTimes: [] };
    groups[key].total++;
    if (t.stage === 'DONE') {
      groups[key].done++;
      if (t.completedAt && t.createdAt) {
        const days = msDays(new Date(t.completedAt) - new Date(t.createdAt));
        if (days >= 0) groups[key].leadTimes.push(days);
      }
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

function run() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const doSave = args.includes('--save');

  const data = loadBoard();
  // Exclude ARCHIVED tasks from rate analysis — they were removed, not completed
  const tasks = (data.tasks || []).filter(t => t.stage !== 'ARCHIVED');

  const done = tasks.filter(t => t.stage === 'DONE');

  // Overall rate
  const overall = {
    total: tasks.length,
    done: done.length,
    rate: tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0,
  };

  // Lead times for DONE tasks
  const leadTimes = done
    .filter(t => t.completedAt && t.createdAt)
    .map(t => msDays(new Date(t.completedAt) - new Date(t.createdAt)));

  const leadTimeStats = {
    count: leadTimes.length,
    medianDays: median(leadTimes),
    minDays: leadTimes.length > 0 ? Math.min(...leadTimes) : null,
    maxDays: leadTimes.length > 0 ? Math.max(...leadTimes) : null,
  };

  const byCategory = ratesByDimension(tasks, 'category');
  const byOwner = ratesByDimension(tasks, 'owner');
  const bySource = ratesByDimension(tasks, 'source');
  const byTaskType = ratesByDimension(tasks, 'taskType');
  const byPriority = ratesByDimension(tasks, 'priority');

  const report = {
    generatedAt: new Date().toISOString(),
    overall,
    leadTimeStats,
    byCategory,
    byOwner,
    bySource,
    byTaskType,
    byPriority,
  };

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

  const lines = [];
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
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

  tableSection('Category', byCategory, 'category');
  tableSection('Owner', byOwner, 'owner');
  tableSection('Source', bySource, 'source');
  tableSection('Task Type', byTaskType, 'taskType');
  tableSection('Priority', byPriority, 'priority');

  // Interpretation notes
  lines.push('## Notes');
  lines.push('');
  lines.push('- Lead time is measured from `createdAt` to `completedAt` and includes waiting time.');
  lines.push('- ARCHIVED tasks are excluded (they were removed, not completed).');
  lines.push(`- Dataset is small (${overall.done} completed tasks). Rates will become meaningful at 25+ completions.`);
  lines.push('');

  const md = lines.join('\n');

  if (doSave) {
    const p = path.join(OUTPUTS_DIR, 'completion-rate.md');
    fs.writeFileSync(p, md);
    console.error(`Saved to ${p}`);
  }

  console.log(md);
}

run();
