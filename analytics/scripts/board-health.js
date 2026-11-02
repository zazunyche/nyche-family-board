#!/usr/bin/env node
/**
 * board-health.js — Board health snapshot
 *
 * Outputs a markdown summary of current board state:
 * active task count, stale tasks, overdue tasks, high-brief-count tasks,
 * missing fields, and stage distribution.
 *
 * Usage:
 *   node analytics/scripts/board-health.js
 *   node analytics/scripts/board-health.js --json
 *   node analytics/scripts/board-health.js --save   (writes to analytics/outputs/daily-health.md)
 */

'use strict';

const path = require('path');
const fs = require('fs');

const BOARD_PATH = path.join(__dirname, '../../board-data.json');
const OUTPUTS_DIR = path.join(__dirname, '../outputs');
const STALE_DAYS = 14;
const HIGH_BRIEF_THRESHOLD = 3;
const RESISTANCE_STALE_DAYS = 7; // must match priority-escalation.sh threshold
// An IDEA-stage task whose dueDate is further out than this is dormant-by-design
// (e.g. a quarterly tax task waiting for its quarter), not forgotten — don't flag stale.
const DORMANT_IDEA_LEAD_DAYS = 30;

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}

function msDays(ms) {
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Returns how many days a task has been in its current stage.
// Uses stageHistory enteredAt (same source as priority-escalation.sh) so that
// updatedAt writes (escalation flags, resistance writes) don't reset the clock.
function stageAgeDays(task, now) {
  const entry = (task.stageHistory || [])
    .filter(s => s.stage === task.stage && s.exitedAt === null)
    .slice(-1)[0];
  const enteredAt = entry ? entry.enteredAt : (task.createdAt || new Date(now).toISOString());
  return msDays(now - new Date(enteredAt).getTime());
}

function run() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const doSave = args.includes('--save');

  const data = loadBoard();
  const tasks = data.tasks || [];
  const now = Date.now();

  const active = tasks.filter(t => t.stage !== 'DONE' && t.stage !== 'ARCHIVED');
  const done = tasks.filter(t => t.stage === 'DONE');
  const archived = tasks.filter(t => t.stage === 'ARCHIVED');

  // Stage distribution
  const byStage = {};
  tasks.forEach(t => { byStage[t.stage] = (byStage[t.stage] || 0) + 1; });

  // Stage distribution for active only
  const activeByStage = {};
  active.forEach(t => { activeByStage[t.stage] = (activeByStage[t.stage] || 0) + 1; });

  // Snoozed tasks are intentionally deferred — exclude them from problem flags
  // (stale / high-brief / resistance) so the health report doesn't nag about
  // tasks we've deliberately parked until a future date.
  const isSnoozed = t => t.snoozedUntil && new Date(t.snoozedUntil) > now;

  // A future-dated IDEA task is waiting for its trigger window to open, not stalled.
  // Catches quarterly-tax-style tasks even when no one has manually snoozed them, so
  // the stale list doesn't over-count dormant-by-design work. (Snooze still wins above.)
  const isDormantFutureIdea = t =>
    t.stage === 'IDEA' &&
    t.dueDate &&
    msDays(new Date(t.dueDate).getTime() - now) > DORMANT_IDEA_LEAD_DAYS;

  // Stale: non-snoozed active tasks whose current stage has been unchanged for > STALE_DAYS.
  // Uses stageHistory enteredAt (not updatedAt) so escalation/resistance writes don't hide staleness.
  const stale = active.filter(t => {
    if (isSnoozed(t) || isDormantFutureIdea(t)) return false;
    return stageAgeDays(t, now) > STALE_DAYS;
  }).map(t => ({
    id: t.id,
    title: t.title,
    stage: t.stage,
    owner: t.owner,
    ageDays: stageAgeDays(t, now),
  }));

  // Overdue: due DATE strictly before today (ET), not DONE/ARCHIVED.
  // Compared at calendar-date granularity in America/New_York so a task due
  // *today* is never flagged (it's due, not overdue) and time-of-day can't tip
  // it over. calDaysBetween uses Date.UTC on the date-only components, so the
  // count is always a whole number of calendar days — no DST drift and none of
  // the Math.round over-count that previously reported due-today as "1 day
  // overdue" (and every overdue task one day too high).
  const todayET = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const calDaysBetween = (fromStr, toStr) => {
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
  };
  const overdue = active.filter(t => t.dueDate && calDaysBetween(t.dueDate, todayET) > 0)
    .map(t => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      owner: t.owner,
      overdueDays: calDaysBetween(t.dueDate, todayET),
    }));

  // High brief count: briefed >= threshold and still open
  const highBrief = active
    .filter(t => !isSnoozed(t) && (t.briefCount || 0) >= HIGH_BRIEF_THRESHOLD)
    .map(t => ({ id: t.id, title: t.title, briefCount: t.briefCount, owner: t.owner }));

  // Missing analytics fields on active tasks
  const missingTaskType = active.filter(t => !t.taskType).map(t => t.id);
  const missingEffortTag = active.filter(t => !t.effortTag).map(t => t.id);
  const missingStageHistory = active.filter(t => !t.stageHistory || t.stageHistory.length === 0).map(t => t.id);

  // Resistance candidates: briefed >= 3, stale >= RESISTANCE_STALE_DAYS, resistanceScore still 0.
  // Mirrors priority-escalation.sh criteria so the two agree on what's "pending."
  const resistanceCandidates = active
    .filter(t =>
      !isSnoozed(t) &&
      (t.briefCount || 0) >= HIGH_BRIEF_THRESHOLD &&
      stageAgeDays(t, now) >= RESISTANCE_STALE_DAYS &&
      (t.resistanceScore || 0) === 0
    )
    .map(t => t.id);

  // Resistance flagged: have an active resistanceScore > 0
  const resistanceFlagged = active
    .filter(t => !isSnoozed(t) && (t.resistanceScore || 0) > 0)
    .map(t => ({ id: t.id, title: t.title, score: t.resistanceScore, briefCount: t.briefCount || 0, owner: t.owner }));

  // Category distribution (active)
  const byCategory = {};
  active.forEach(t => { byCategory[t.category] = (byCategory[t.category] || 0) + 1; });

  // Owner distribution (active)
  const byOwner = {};
  active.forEach(t => { byOwner[t.owner] = (byOwner[t.owner] || 0) + 1; });

  // Priority distribution (active)
  const byPriority = {};
  active.forEach(t => { byPriority[t.priority] = (byPriority[t.priority] || 0) + 1; });

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: tasks.length,
      active: active.length,
      done: done.length,
      archived: archived.length,
    },
    activeByStage,
    byCategory,
    byOwner,
    byPriority,
    stale,
    overdue,
    highBrief,
    missingFields: {
      taskType: missingTaskType,
      effortTag: missingEffortTag,
      stageHistory: missingStageHistory,
    },
    resistanceCandidates,
    resistanceFlagged,
  };

  if (asJson) {
    const out = JSON.stringify(report, null, 2);
    if (doSave) {
      const p = path.join(OUTPUTS_DIR, 'daily-health.json');
      fs.writeFileSync(p, out);
      console.error(`Saved to ${p}`);
    }
    console.log(out);
    return;
  }

  const lines = [];
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  lines.push(`# Board Health — ${ts}`);
  lines.push('');

  // Summary row
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Total | Active | Done | Archived |`);
  lines.push(`|-------|--------|------|----------|`);
  lines.push(`| ${report.summary.total} | ${report.summary.active} | ${report.summary.done} | ${report.summary.archived} |`);
  lines.push('');

  // Active by stage
  lines.push('## Active Tasks by Stage');
  lines.push('');
  lines.push('| Stage | Count |');
  lines.push('|-------|-------|');
  Object.entries(activeByStage).sort((a, b) => b[1] - a[1]).forEach(([stage, count]) => {
    lines.push(`| ${stage} | ${count} |`);
  });
  lines.push('');

  // By category
  lines.push('## Active Tasks by Category');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|----------|-------|');
  Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    lines.push(`| ${cat} | ${count} |`);
  });
  lines.push('');

  // By owner
  lines.push('## Active Tasks by Owner');
  lines.push('');
  lines.push('| Owner | Count |');
  lines.push('|-------|-------|');
  Object.entries(byOwner).sort((a, b) => b[1] - a[1]).forEach(([owner, count]) => {
    lines.push(`| ${owner} | ${count} |`);
  });
  lines.push('');

  // Overdue
  lines.push(`## Overdue Tasks (${overdue.length})`);
  lines.push('');
  if (overdue.length === 0) {
    lines.push('_None_');
  } else {
    lines.push('| ID | Title | Due | Days Overdue | Owner |');
    lines.push('|----|-------|-----|-------------|-------|');
    overdue.forEach(t => {
      lines.push(`| ${t.id} | ${t.title.slice(0, 50)} | ${t.dueDate} | ${t.overdueDays} | ${t.owner} |`);
    });
  }
  lines.push('');

  // Stale
  lines.push(`## Stale Tasks — no update in ${STALE_DAYS}+ days (${stale.length})`);
  lines.push('');
  if (stale.length === 0) {
    lines.push('_None_');
  } else {
    lines.push('| ID | Title | Stage | Age (days) | Owner |');
    lines.push('|----|-------|-------|-----------|-------|');
    stale.forEach(t => {
      lines.push(`| ${t.id} | ${t.title.slice(0, 50)} | ${t.stage} | ${t.ageDays} | ${t.owner} |`);
    });
  }
  lines.push('');

  // High brief count
  lines.push(`## High Brief Count — briefed ${HIGH_BRIEF_THRESHOLD}+ times with no completion (${highBrief.length})`);
  lines.push('');
  if (highBrief.length === 0) {
    lines.push('_None_');
  } else {
    lines.push('| ID | Title | Brief Count | Owner |');
    lines.push('|----|-------|-------------|-------|');
    highBrief.forEach(t => {
      lines.push(`| ${t.id} | ${t.title.slice(0, 50)} | ${t.briefCount} | ${t.owner} |`);
    });
  }
  lines.push('');

  // Missing fields
  const totalMissing = missingTaskType.length + missingEffortTag.length + missingStageHistory.length;
  lines.push(`## Data Quality (${totalMissing} missing fields)`);
  lines.push('');
  lines.push(`| Field | Missing on (task IDs) |`);
  lines.push(`|-------|-----------------------|`);
  lines.push(`| taskType | ${missingTaskType.length === 0 ? '✓ none' : missingTaskType.join(', ')} |`);
  lines.push(`| effortTag | ${missingEffortTag.length === 0 ? '✓ none' : missingEffortTag.join(', ')} |`);
  lines.push(`| stageHistory | ${missingStageHistory.length === 0 ? '✓ none' : missingStageHistory.join(', ')} |`);
  lines.push('');

  // Resistance flagged (have score > 0)
  if (resistanceFlagged.length > 0) {
    lines.push(`## Resistance Flagged — stalled after ${HIGH_BRIEF_THRESHOLD}+ briefings (${resistanceFlagged.length})`);
    lines.push('');
    lines.push('| ID | Title | Score | Briefings | Owner |');
    lines.push('|----|-------|-------|-----------|-------|');
    resistanceFlagged.sort((a, b) => b.score - a.score).forEach(t => {
      lines.push(`| ${t.id} | ${t.title.slice(0, 50)} | ${t.score}/5 | ${t.briefCount} | ${t.owner} |`);
    });
    lines.push('');
  }

  if (resistanceCandidates.length > 0) {
    lines.push(`> **Resistance pending:** ${resistanceCandidates.join(', ')} — briefed ${HIGH_BRIEF_THRESHOLD}+ times, resistanceScore still 0 (will be set by nightly escalation).`);
    lines.push('');
  }

  const md = lines.join('\n');

  if (doSave) {
    const p = path.join(OUTPUTS_DIR, 'daily-health.md');
    fs.writeFileSync(p, md);
    console.error(`Saved to ${p}`);
  }

  console.log(md);
}

run();
