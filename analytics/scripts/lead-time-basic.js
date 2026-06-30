#!/usr/bin/env node
/**
 * lead-time-basic.js — Lead time histogram and per-category median
 *
 * Answers: How long do tasks take from creation to done, by category?
 * Distinct from completion-rate.js's per-category median: this script buckets
 * every completed task into a duration histogram so the shape of the
 * distribution (lots of same-day closures vs. a long tail) is visible, not
 * just the midpoint.
 *
 * Usage:
 *   node analytics/scripts/lead-time-basic.js
 *   node analytics/scripts/lead-time-basic.js --json
 *   node analytics/scripts/lead-time-basic.js --save   (writes analytics/outputs/lead-time-basic.md)
 */

'use strict';

const path = require('path');
const fs = require('fs');

const BOARD_PATH = path.join(__dirname, '../../board-data.json');
const OUTPUTS_DIR = path.join(__dirname, '../outputs');

const BUCKETS = [
  { label: '<1 hour', maxHours: 1 },
  { label: '1-24 hours', maxHours: 24 },
  { label: '1-3 days', maxHours: 24 * 3 },
  { label: '3-7 days', maxHours: 24 * 7 },
  { label: '1-4 weeks', maxHours: 24 * 30 },
  { label: '1-3 months', maxHours: 24 * 90 },
  { label: '3+ months', maxHours: Infinity },
];

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}

function median(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function bucketFor(hours) {
  return BUCKETS.find(b => hours <= b.maxHours).label;
}

function run() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const doSave = args.includes('--save');

  const data = loadBoard();
  const tasks = (data.tasks || []).filter(t => t.stage !== 'ARCHIVED');

  const done = tasks.filter(
    t => t.stage === 'DONE' && t.completedAt && t.createdAt
  );

  const leadTimesHours = done.map(t => {
    const hours = (new Date(t.completedAt) - new Date(t.createdAt)) / (1000 * 60 * 60);
    return { id: t.id, title: t.title, category: t.category, hours };
  }).filter(t => t.hours >= 0);

  // Overall histogram
  const histogram = BUCKETS.map(b => ({ label: b.label, count: 0 }));
  leadTimesHours.forEach(t => {
    const label = bucketFor(t.hours);
    histogram.find(b => b.label === label).count++;
  });

  // Per-category median (days)
  const byCategory = {};
  leadTimesHours.forEach(t => {
    const key = t.category || 'unknown';
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(t.hours / 24);
  });
  const round1 = n => (n == null ? null : +n.toFixed(1));

  const categoryMedians = Object.entries(byCategory)
    .map(([category, days]) => ({ category, count: days.length, medianDays: round1(median(days)) }))
    .sort((a, b) => (b.medianDays || 0) - (a.medianDays || 0));

  const allDays = leadTimesHours.map(t => t.hours / 24);
  const overall = {
    count: allDays.length,
    medianDays: round1(median(allDays)),
    minDays: allDays.length ? round1(Math.min(...allDays)) : null,
    maxDays: allDays.length ? round1(Math.max(...allDays)) : null,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    overall,
    histogram,
    byCategory: categoryMedians,
  };

  if (asJson) {
    const out = JSON.stringify(report, null, 2);
    if (doSave) {
      const p = path.join(OUTPUTS_DIR, 'lead-time-basic.json');
      fs.writeFileSync(p, out);
      console.error(`Saved to ${p}`);
    }
    console.log(out);
    return;
  }

  const lines = [];
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  lines.push(`# Lead Time Report — ${ts}`);
  lines.push('');
  lines.push(`_${overall.count} completed tasks with valid timestamps. Median lead time: **${overall.medianDays != null ? overall.medianDays + ' days' : 'n/a'}** (min ${overall.minDays}d, max ${overall.maxDays}d)_`);
  lines.push('');

  lines.push('## Distribution');
  lines.push('');
  lines.push('| Bucket | Count |');
  lines.push('|--------|-------|');
  histogram.forEach(b => {
    const bar = '█'.repeat(b.count);
    lines.push(`| ${b.label} | ${b.count} ${bar} |`);
  });
  lines.push('');

  lines.push('## Median Lead Time by Category');
  lines.push('');
  lines.push('| Category | Count | Median Days |');
  lines.push('|----------|-------|-------------|');
  categoryMedians.forEach(c => {
    lines.push(`| ${c.category} | ${c.count} | ${c.medianDays} |`);
  });
  lines.push('');

  lines.push('## Notes');
  lines.push('');
  lines.push('- Buckets are creation→completion wall-clock time, including wait time.');
  lines.push('- The `<1 hour` and `1-24 hours` buckets often include bulk-close/triage artifacts, not genuine same-day execution — cross-check against `completion-rate.md` before drawing conclusions.');
  lines.push('- ARCHIVED tasks are excluded.');
  lines.push('');

  const md = lines.join('\n');

  if (doSave) {
    const p = path.join(OUTPUTS_DIR, 'lead-time-basic.md');
    fs.writeFileSync(p, md);
    console.error(`Saved to ${p}`);
  }

  console.log(md);
}

run();
