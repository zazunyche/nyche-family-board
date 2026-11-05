#!/usr/bin/env node
/**
 * snooze-pattern.js — Deferral behavior: when do tasks get snoozed, and do they come back?
 *
 * A snooze is the one *explicit* "not now" signal on the board — distinct from a task
 * silently going stale. This script mines every snooze event out of task history and
 * answers two questions the roadmap posed:
 *   1. WHEN do deferrals happen — by owner and by day-of-week — so we can see whether
 *      snoozing clusters (e.g. always a Friday "deal-with-it-next-week" move).
 *   2. DO THEY COME BACK — once a snooze window expires, did the task actually move
 *      (progress a stage / complete), or did it just lapse back into silent staleness?
 *      A snooze that never comes back is a soft-abandon wearing a timestamp.
 *
 * Snooze events are parsed from history entries whose `change` text records a
 * `snoozedUntil: ... → YYYY-MM-DD` transition (the same text board mutations already
 * write), so there's no separate event log to keep in sync. The event's actor is kept
 * distinct from the task owner: a ZAZU-set parking (e.g. future-dated recurring taxes)
 * is a different signal from a human hitting snooze, and we label it as such.
 *
 * This is a read-only reflection script — like the rest of analytics/, it reports and
 * never mutates the board.
 *
 * Usage:
 *   node analytics/scripts/snooze-pattern.js
 *   node analytics/scripts/snooze-pattern.js --json
 *   node analytics/scripts/snooze-pattern.js --save   (writes analytics/outputs/snooze-pattern.md)
 */

'use strict';

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '../..');
const BOARD_PATH = path.join(REPO_ROOT, 'board-data.json');
const OUTPUTS_DIR = path.join(__dirname, '../outputs');

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}

function msDays(ms) {
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Day-of-week label for an ISO timestamp, in ET so a late-night snooze lands on the
// day it felt like to the family, not the UTC day. Returns 'Sun'..'Sat'.
function etWeekday(iso) {
  const wd = new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  return wd;
}

// Parse every snooze-SET event out of a task's history. We only count transitions that
// land on a concrete date (snoozedUntil: ... → YYYY-MM-DD); a clear (→ none) is not a
// deferral. Returns [{ when, actor, until }].
function snoozeEvents(task) {
  const out = [];
  (task.history || []).forEach(h => {
    const m = (h.change || '').match(/snoozedUntil:\s*\S.*?→\s*(\d{4}-\d{2}-\d{2})/);
    if (m) out.push({ when: h.timestamp, actor: h.actor || 'UNKNOWN', until: m[1] });
  });
  return out;
}

// Did the task MOVE after its snooze window opened back up? "Came back" = completed, or
// changed stage, after the snoozedUntil date. If the window hasn't opened yet it's
// 'parked' (correctly waiting, verdict pending). If it opened and nothing moved, it's
// 'lapsed' — the snooze expired into silent staleness.
function returnStatus(task, lastUntil, now) {
  const untilMs = new Date(lastUntil).getTime();
  if (untilMs > now) return { status: 'parked', detail: `window opens ${lastUntil}` };

  if (task.completedAt && new Date(task.completedAt).getTime() >= untilMs) {
    return { status: 'returned', detail: `completed after snooze (${task.completedAt.slice(0, 10)})` };
  }
  // A stage change after the window reopened = the task re-entered real flow.
  const movedAfter = (task.history || []).some(h =>
    /stage:/i.test(h.change || '') && new Date(h.timestamp).getTime() > untilMs
  );
  if (movedAfter) return { status: 'returned', detail: 'stage moved after window reopened' };

  return { status: 'lapsed', detail: `window opened ${lastUntil}, ${msDays(now - untilMs)}d ago, no movement since` };
}

function run() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const doSave = args.includes('--save');

  const data = loadBoard();
  const tasks = data.tasks || [];
  const now = Date.now();

  // Flatten to one row per snooze event (a task can be snoozed more than once over time).
  const events = [];
  const snoozedTasks = [];
  tasks.forEach(t => {
    const evs = snoozeEvents(t);
    if (evs.length === 0) return;
    const lastUntil = evs[evs.length - 1].until;
    const ret = returnStatus(t, lastUntil, now);
    snoozedTasks.push({ id: t.id, title: t.title, owner: t.owner, snoozeCount: evs.length, lastUntil, ...ret });
    evs.forEach(e => {
      const setDay = e.until; // snoozedUntil is a date; duration from the event timestamp
      const durDays = msDays(new Date(setDay).getTime() - new Date(e.when).getTime());
      events.push({ id: t.id, owner: t.owner, actor: e.actor, when: e.when, weekday: etWeekday(e.when), until: e.until, durDays });
    });
  });

  const byOwner = {};
  const byWeekday = {};
  const byActor = {};
  events.forEach(e => {
    byOwner[e.owner] = (byOwner[e.owner] || 0) + 1;
    byWeekday[e.weekday] = (byWeekday[e.weekday] || 0) + 1;
    byActor[e.actor] = (byActor[e.actor] || 0) + 1;
  });

  const returnCounts = { returned: 0, parked: 0, lapsed: 0 };
  snoozedTasks.forEach(t => { returnCounts[t.status] = (returnCounts[t.status] || 0) + 1; });

  const avgDur = events.length
    ? Math.round(events.reduce((s, e) => s + e.durDays, 0) / events.length)
    : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,
    tasksEverSnoozed: snoozedTasks.length,
    avgSnoozeDurationDays: avgDur,
    byOwner, byWeekday, byActor,
    returnCounts,
    events, snoozedTasks,
  };

  if (asJson) {
    const out = JSON.stringify(report, null, 2);
    if (doSave) {
      const p = path.join(OUTPUTS_DIR, 'snooze-pattern.json');
      fs.writeFileSync(p, out);
      console.error(`Saved to ${p}`);
    }
    console.log(out);
    return;
  }

  const lines = [];
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  lines.push(`# Snooze Pattern — ${ts}`);
  lines.push('');
  lines.push('**Purpose:** A snooze is the only *explicit* "not now" signal on the board. This pass answers: **when** do deferrals happen (by owner, by day-of-week) and **do they come back** — i.e. once the snooze window reopens, does the task actually move, or lapse into silent staleness? Read-only reflection; nothing here mutates the board.');
  lines.push('');

  if (events.length === 0) {
    lines.push('_No snooze events in board history yet — nothing to analyze. This script activates once tasks start using `snoozedUntil`._');
    lines.push('');
    lines.push('_Generated by `analytics/scripts/snooze-pattern.js` — rerun with `--save` to refresh._');
    const out = lines.join('\n') + '\n';
    if (doSave) { fs.writeFileSync(path.join(OUTPUTS_DIR, 'snooze-pattern.md'), out); console.error('Saved.'); }
    console.log(out);
    return;
  }

  lines.push(`${events.length} snooze event${events.length === 1 ? '' : 's'} across ${snoozedTasks.length} task${snoozedTasks.length === 1 ? '' : 's'}; average snooze length **${avgDur} days**.`);
  lines.push('');

  lines.push('## By owner');
  lines.push('');
  lines.push('| Owner | Snoozes |');
  lines.push('|-------|---------|');
  Object.entries(byOwner).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
  lines.push('');

  lines.push('## By day-of-week (ET)');
  lines.push('');
  lines.push('| Day | Snoozes |');
  lines.push('|-----|---------|');
  DAYS.forEach(d => { if (byWeekday[d]) lines.push(`| ${d} | ${byWeekday[d]} |`); });
  lines.push('');

  lines.push('## Who hit snooze');
  lines.push('');
  lines.push('_A snooze set by ZAZU (e.g. auto-parking a future-dated recurring task) is a different signal from a human deferral._');
  lines.push('');
  lines.push('| Actor | Snoozes |');
  lines.push('|-------|---------|');
  Object.entries(byActor).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => lines.push(`| ${k} | ${v} |`));
  lines.push('');

  lines.push('## Do they come back?');
  lines.push('');
  lines.push(`**${returnCounts.returned} returned** (moved/completed after the window reopened) · **${returnCounts.parked} parked** (still correctly waiting) · **${returnCounts.lapsed} lapsed** (window reopened, no movement since).`);
  lines.push('');
  lines.push('| ID | Title | Owner | Snoozed until | Verdict | Detail |');
  lines.push('|----|-------|-------|---------------|---------|--------|');
  snoozedTasks.forEach(t => {
    const verdict = t.status === 'returned' ? '✅ returned' : t.status === 'parked' ? '⏳ parked' : '⚠️ lapsed';
    lines.push(`| ${t.id} | ${t.title.slice(0, 40)} | ${t.owner} | ${t.lastUntil} | ${verdict} | ${t.detail} |`);
  });
  lines.push('');

  lines.push('## Takeaways');
  lines.push('');
  const topDay = Object.entries(byWeekday).sort((a, b) => b[1] - a[1])[0];
  const allZazu = Object.keys(byActor).length === 1 && byActor.ZAZU;
  if (allZazu) {
    lines.push('1. **Every snooze so far is ZAZU-set** — these are auto-parked future-dated tasks (e.g. recurring taxes), not human "not now" deferrals. No human avoidance signal to read yet.');
  } else {
    lines.push(`1. Snoozing clusters on **${topDay[0]}** (${topDay[1]} of ${events.length}). Watch whether that's a recurring "deal-with-it-later" day.`);
  }
  if (returnCounts.lapsed > 0) {
    lines.push(`2. **${returnCounts.lapsed} snooze${returnCounts.lapsed === 1 ? ' has' : 's have'} lapsed** — the window reopened and nothing moved. Those are soft-abandons; route them through staleness-triage for a close/confirm call.`);
  } else {
    lines.push(`2. No lapsed snoozes — ${returnCounts.parked} still parked, ${returnCounts.returned} came back. Deferral is being used honestly so far.`);
  }
  lines.push(`3. Average snooze length is **${avgDur} days**. Re-check this report once any parked task's window reopens — that's when the "do they come back?" signal gets real.`);
  lines.push('');
  lines.push('_Generated by `analytics/scripts/snooze-pattern.js` — rerun with `--save` to refresh._');

  const out = lines.join('\n') + '\n';
  if (doSave) {
    const p = path.join(OUTPUTS_DIR, 'snooze-pattern.md');
    fs.writeFileSync(p, out);
    console.error(`Saved to ${p}`);
  }
  console.log(out);
}

run();
