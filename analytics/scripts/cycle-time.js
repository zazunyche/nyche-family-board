#!/usr/bin/env node
/**
 * cycle-time.js — Per-task and per-category cycle time analysis
 *
 * Calculates: time-in-each-stage, total lead time (creation→done),
 * and median/min/max per category and owner.
 *
 * Usage:
 *   node analytics/scripts/cycle-time.js
 *   node analytics/scripts/cycle-time.js --save   (writes to analytics/outputs/cycle-time.md)
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const BOARD_PATH  = path.join(__dirname, '../../board-data.json');
const OUTPUTS_DIR = path.join(__dirname, '../outputs');

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}

function msDays(ms) {
  return Math.round((ms / (1000 * 60 * 60 * 24)) * 10) / 10;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? msDays((s[m - 1] + s[m]) / 2 * 1) : msDays(s[m]);
}

function statsRow(values) {
  if (!values.length) return { n: 0, median: null, min: null, max: null };
  const s = [...values].sort((a, b) => a - b);
  return {
    n:      values.length,
    median: median(values),
    min:    msDays(s[0]),
    max:    msDays(s[s.length - 1]),
  };
}

function dateStr(iso) {
  return iso ? iso.slice(0, 10) : '—';
}

function run() {
  const board = loadBoard();
  const tasks = board.tasks || [];
  const now   = Date.now();
  const reportDate = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  // ── Per-task lead times (DONE tasks only for lead time; all for age) ────────
  const doneTasks   = tasks.filter(t => t.stage === 'DONE' && t.createdAt && t.completedAt);
  const activeTasks = tasks.filter(t => t.stage !== 'DONE' && t.createdAt);

  const doneLeadMs = doneTasks.map(t =>
    new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()
  );

  const lines = [];
  lines.push(`# Cycle Time Report — ${reportDate}`);
  lines.push('');
  lines.push(`_${doneTasks.length} completed tasks analyzed. ${activeTasks.length} active tasks (age shown)._`);
  lines.push('');

  // ── Overall lead time ────────────────────────────────────────────────────────
  const overall = statsRow(doneLeadMs);
  lines.push('## Overall Lead Time (creation → done)');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Completed tasks | ${overall.n} |`);
  lines.push(`| Median | ${overall.median ?? '—'}d |`);
  lines.push(`| Min    | ${overall.min ?? '—'}d |`);
  lines.push(`| Max    | ${overall.max ?? '—'}d |`);
  lines.push('');

  // ── By category ──────────────────────────────────────────────────────────────
  lines.push('## Lead Time by Category (completed tasks)');
  lines.push('');
  lines.push('| Category | n | Median | Min | Max |');
  lines.push('|----------|---|--------|-----|-----|');

  const cats = [...new Set(doneTasks.map(t => t.category || 'UNKNOWN'))].sort();
  for (const cat of cats) {
    const ms = doneTasks
      .filter(t => t.category === cat)
      .map(t => new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime());
    const s = statsRow(ms);
    lines.push(`| ${cat} | ${s.n} | ${s.median ?? '—'}d | ${s.min ?? '—'}d | ${s.max ?? '—'}d |`);
  }
  lines.push('');

  // ── By owner ─────────────────────────────────────────────────────────────────
  lines.push('## Lead Time by Owner (completed tasks)');
  lines.push('');
  lines.push('| Owner | n | Median | Min | Max |');
  lines.push('|-------|---|--------|-----|-----|');

  const owners = [...new Set(doneTasks.map(t => t.owner || 'UNKNOWN'))].sort();
  for (const owner of owners) {
    const ms = doneTasks
      .filter(t => t.owner === owner)
      .map(t => new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime());
    const s = statsRow(ms);
    lines.push(`| ${owner} | ${s.n} | ${s.median ?? '—'}d | ${s.min ?? '—'}d | ${s.max ?? '—'}d |`);
  }
  lines.push('');

  // ── By taskType ──────────────────────────────────────────────────────────────
  const withType = doneTasks.filter(t => t.taskType);
  if (withType.length > 0) {
    lines.push('## Lead Time by Task Type');
    lines.push('');
    lines.push('| Type | n | Median | Min | Max |');
    lines.push('|------|---|--------|-----|-----|');

    const types = [...new Set(withType.map(t => t.taskType))].sort();
    for (const type of types) {
      const ms = withType
        .filter(t => t.taskType === type)
        .map(t => new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime());
      const s = statsRow(ms);
      lines.push(`| ${type} | ${s.n} | ${s.median ?? '—'}d | ${s.min ?? '—'}d | ${s.max ?? '—'}d |`);
    }
    lines.push('');
  }

  // ── Active task age (how long has it been open?) ─────────────────────────────
  lines.push('## Active Task Age (oldest first)');
  lines.push('');
  lines.push('| Task | Category | Owner | Stage | Age (days) | effortTag |');
  lines.push('|------|----------|-------|-------|-----------|-----------|');

  const aged = activeTasks
    .map(t => ({ ...t, ageDays: msDays(now - new Date(t.createdAt).getTime()) }))
    .sort((a, b) => b.ageDays - a.ageDays);

  for (const t of aged) {
    const title = t.title.length > 45 ? t.title.slice(0, 42) + '…' : t.title;
    lines.push(`| ${title} | ${t.category || '—'} | ${t.owner || '—'} | ${t.stage} | ${t.ageDays}d | ${t.effortTag || '—'} |`);
  }
  lines.push('');

  // ── Stage history dwell time (tasks that have stageHistory) ─────────────────
  const withHistory = tasks.filter(t => t.stageHistory && t.stageHistory.length > 1);
  if (withHistory.length > 0) {
    lines.push('## Stage Dwell Time (tasks with stageHistory)');
    lines.push('');

    const stageDwells = {};
    for (const t of withHistory) {
      for (const s of t.stageHistory) {
        if (s.durationMs != null && s.durationMs > 0) {
          (stageDwells[s.stage] = stageDwells[s.stage] || []).push(s.durationMs);
        }
      }
    }

    lines.push('| Stage | n | Median dwell | Min | Max |');
    lines.push('|-------|---|-------------|-----|-----|');
    for (const [stage, ms] of Object.entries(stageDwells).sort()) {
      const s = statsRow(ms);
      lines.push(`| ${stage} | ${s.n} | ${s.median ?? '—'}d | ${s.min ?? '—'}d | ${s.max ?? '—'}d |`);
    }
    lines.push('');
  }

  const report = lines.join('\n');

  if (process.argv.includes('--save')) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
    const outPath = path.join(OUTPUTS_DIR, 'cycle-time.md');
    fs.writeFileSync(outPath, report);
    console.log(`Saved to ${outPath}`);
  } else {
    console.log(report);
  }
}

run();
