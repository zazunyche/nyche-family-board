#!/usr/bin/env node
/**
 * staleness-triage.js — Decision digest for stalled tasks
 *
 * board-health.js and board-reminders.sh *nudge* stalled tasks. This script does
 * the thing nudging can't: it classifies each active task into a recommended STATE
 * DECISION so Dad/Mom can clear the board with one-word calls instead of yet another
 * ignored reminder.
 *
 * Buckets:
 *   CLOSE   — trigger/due window long past; task is probably moot or already done
 *             in real life. Confirm the real-world outcome, then close.
 *   CONFIRM — real and still relevant, but the status has almost certainly changed
 *             since it was last touched. One update unblocks it.
 *   KEEP    — correctly waiting (snoozed, or a future-dated IDEA dormant until its
 *             window opens, or simply fresh). No action needed.
 *
 * None of these can be advanced by Zazu — they need a human decision. The point of
 * the digest is to make that decision a 5-minute pass instead of a standing nag.
 *
 * Usage:
 *   node analytics/scripts/staleness-triage.js
 *   node analytics/scripts/staleness-triage.js --json
 *   node analytics/scripts/staleness-triage.js --save   (writes analytics/outputs/staleness-triage.md)
 */

'use strict';

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '../..');
const BOARD_PATH = path.join(REPO_ROOT, 'board-data.json');
const OUTPUTS_DIR = path.join(__dirname, '../outputs');

// Many stalled tasks have a friction-removal guide under docs/guides/ whose path is
// recorded in the task's zazuNotes. Surfacing that link turns "confirm this" into a
// one-click jump to the decision flow. Derived from live zazuNotes (no hand-kept
// task→guide map to drift), and we verify the file still exists so dead links never ship.
function guideFor(task) {
  const m = (task.zazuNotes || '').match(/docs\/guides\/[\w.-]+\.md/);
  if (!m) return null;
  return fs.existsSync(path.join(REPO_ROOT, m[0])) ? m[0] : null;
}

const STALE_DAYS = 14;            // matches board-health.js
const DORMANT_IDEA_LEAD_DAYS = 30; // matches board-health.js
const CLOSE_OVERDUE_DAYS = 14;    // overdue by more than this → window has passed, likely moot
const MOOT_STALE_DAYS = 90;       // no due date but dormant this long → likely moot
const HUMAN_TOUCH_RECENT_DAYS = 30; // a human edit this recent = active intent → never auto-CLOSE

function loadBoard() {
  return JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
}

function msDays(ms) {
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Whole calendar days between two YYYY-MM-DD dates (toStr - fromStr), computed on
// date-only UTC components so the result is exact — no DST drift, no time-of-day
// rounding. Pair with etToday(now) so a task due *today* reads as 0 days past
// rather than being rounded up to "1d past" by a timestamp subtraction.
function calDaysBetween(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}
function etToday(now) {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// Days since the most recent *human* edit (history entry by an actor other than ZAZU),
// or null if a human never touched it. Zazu's own resistance/backfill/zazuNotes writes
// don't count — only a real DAD/MOM action signals active intent. Used to protect
// recently-prioritized tasks (e.g. a due date someone just pulled in) from a CLOSE
// recommendation they'd read as "we think this is dead."
function lastHumanTouchDays(task, now) {
  const human = (task.history || []).filter(h => h.actor && h.actor !== 'ZAZU');
  if (human.length === 0) return null;
  const latest = Math.max(...human.map(h => new Date(h.timestamp).getTime()));
  return msDays(now - latest);
}

// Days a task has sat in its current stage (stageHistory enteredAt, not updatedAt,
// so escalation/resistance writes don't reset the clock). Same source as board-health.js.
function stageAgeDays(task, now) {
  const entry = (task.stageHistory || [])
    .filter(s => s.stage === task.stage && s.exitedAt === null)
    .slice(-1)[0];
  const enteredAt = entry ? entry.enteredAt : (task.createdAt || new Date(now).toISOString());
  return msDays(now - new Date(enteredAt).getTime());
}

// Classify one task into { bucket, reason }. See bucket docs above.
function classify(t, now) {
  const stageAge = stageAgeDays(t, now);
  const brief = t.briefCount || 0;
  const signal = brief >= 3 ? ` (briefed ${brief}×)` : '';

  const snoozed = t.snoozedUntil && new Date(t.snoozedUntil) > now;
  if (snoozed) {
    return { bucket: 'KEEP', reason: `Snoozed until ${t.snoozedUntil.slice(0, 10)} — parked by design.` };
  }

  const dormantFutureIdea =
    t.stage === 'IDEA' && t.dueDate &&
    msDays(new Date(t.dueDate).getTime() - now) > DORMANT_IDEA_LEAD_DAYS;
  if (dormantFutureIdea) {
    return { bucket: 'KEEP', reason: `Future-dated IDEA (due ${t.dueDate}) — dormant until its window opens, not stalled.` };
  }

  // A concrete due date that has passed by a wide margin is the one strong,
  // task-structure-only signal that a window has closed — so CLOSE is reserved for
  // that case. A script can't know whether the underlying need persists (a passport
  // still has to be renewed even if overdue), so the wording asks for a decision
  // rather than asserting the task is dead.
  const overdue = t.dueDate ? calDaysBetween(t.dueDate, etToday(now)) : 0;
  if (overdue > 0) {
    if (overdue > CLOSE_OVERDUE_DAYS) {
      // A wide-overdue window usually means moot — UNLESS a human recently engaged it
      // (escalated priority, pulled the due date in, edited notes). That's active intent,
      // not abandonment, so route to CONFIRM: it's wanted and overdue, needs a reschedule,
      // not a "probably dead?" prompt that invites dropping something they just prioritized.
      const humanTouch = lastHumanTouchDays(t, now);
      if (humanTouch != null && humanTouch <= HUMAN_TOUCH_RECENT_DAYS) {
        return { bucket: 'CONFIRM', reason: `Due ${t.dueDate}, ${overdue}d past${signal}, but you updated it ${humanTouch}d ago — still wanted, just overdue. Reschedule the date or knock it out.` };
      }
      return { bucket: 'CLOSE', reason: `Due ${t.dueDate}, now ${overdue}d past${signal}. Window closed — confirm the real-world outcome: close if done/moot, reschedule if the need still stands.` };
    }
    return { bucket: 'CONFIRM', reason: `Due ${t.dueDate}, ${overdue}d past${signal}. Recently due — status has probably changed. One update unblocks it.` };
  }

  // No due date below here. Age alone is NOT a moot signal (a standing debt like a
  // neighbor cost-share stays real however long it sits), so long-stale no-due tasks
  // go to CONFIRM, not CLOSE — the human decides whether it's still live.
  if (stageAge > MOOT_STALE_DAYS) {
    return { bucket: 'CONFIRM', reason: `No due date; no movement in ${stageAge}d${signal}. That much unheeded nudging is itself a signal — confirm whether it's still live or should be closed.` };
  }
  if (stageAge > STALE_DAYS) {
    return { bucket: 'CONFIRM', reason: `No movement in ${stageAge}d${signal}. Still real, but confirm it's current.` };
  }
  return { bucket: 'KEEP', reason: `Fresh — ${stageAge}d in stage, no due date passed. On track.` };
}

function run() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const doSave = args.includes('--save');

  const data = loadBoard();
  const tasks = data.tasks || [];
  const now = Date.now();

  const active = tasks.filter(t => t.stage !== 'DONE' && t.stage !== 'ARCHIVED');

  const triaged = active.map(t => {
    const { bucket, reason } = classify(t, now);
    return { id: t.id, title: t.title, owner: t.owner, stage: t.stage, priority: t.priority, bucket, reason, guide: guideFor(t) };
  });

  const close = triaged.filter(t => t.bucket === 'CLOSE');
  const confirm = triaged.filter(t => t.bucket === 'CONFIRM');
  const keep = triaged.filter(t => t.bucket === 'KEEP');

  const report = {
    generatedAt: new Date().toISOString(),
    activeCount: active.length,
    counts: { close: close.length, confirm: confirm.length, keep: keep.length },
    close, confirm, keep,
  };

  if (asJson) {
    const out = JSON.stringify(report, null, 2);
    if (doSave) {
      const p = path.join(OUTPUTS_DIR, 'staleness-triage.json');
      fs.writeFileSync(p, out);
      console.error(`Saved to ${p}`);
    }
    console.log(out);
    return;
  }

  const lines = [];
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
  lines.push(`# Staleness Triage — ${ts}`);
  lines.push('');
  lines.push('**Purpose:** The daily brief and board-reminders only *nudge* stalled tasks. This pass flags tasks whose trigger/due window is far enough past that the task is probably **moot or already done in real life**, and recommends a state decision (close / confirm / keep). None of these can be advanced by Zazu — they need a one-word call from Dad or Mom.');
  lines.push('');
  lines.push(`${active.length} active tasks: **${close.length} to close**, **${confirm.length} to confirm**, ${keep.length} correctly waiting.`);
  lines.push('');

  const table = (rows) => {
    lines.push('| ID | Title | Owner | Why | Guide |');
    lines.push('|----|-------|-------|-----|-------|');
    rows.forEach(t => {
      const guide = t.guide ? `[${t.guide.replace('docs/guides/', '')}](../../${t.guide})` : '—';
      lines.push(`| ${t.id} | ${t.title.slice(0, 48)} | ${t.owner} | ${t.reason} | ${guide} |`);
    });
  };

  lines.push('## Recommend CLOSE (likely moot — trigger window long passed)');
  lines.push('');
  if (close.length === 0) lines.push('_None_'); else table(close);
  lines.push('');

  lines.push('## Recommend CONFIRM (real, but status almost certainly changed)');
  lines.push('');
  if (confirm.length === 0) lines.push('_None_'); else table(confirm);
  lines.push('');

  lines.push('## Keep as-is (correctly waiting)');
  lines.push('');
  if (keep.length === 0) lines.push('_None_'); else table(keep);
  lines.push('');

  lines.push('## Takeaways');
  lines.push('');
  const closeable = close.length;
  if (closeable > 0) {
    lines.push(`1. **${closeable} task${closeable === 1 ? '' : 's'} probably closeable** — a short check with Dad/Mom could clear ${closeable === 1 ? 'it' : 'them'} off the active board.`);
  } else {
    lines.push('1. Nothing currently looks moot — no close candidates this pass.');
  }
  lines.push(`2. **${confirm.length} need${confirm.length === 1 ? 's' : ''} a status confirm** — real work whose state has likely moved since last touch.`);
  lines.push(`3. ${keep.length} task${keep.length === 1 ? ' is' : 's are'} correctly waiting (snoozed / future-dated / fresh) — no action.`);
  lines.push('');
  lines.push('_Generated by `analytics/scripts/staleness-triage.js` — rerun with `--save` to refresh._');

  const out = lines.join('\n') + '\n';
  if (doSave) {
    const p = path.join(OUTPUTS_DIR, 'staleness-triage.md');
    fs.writeFileSync(p, out);
    console.error(`Saved to ${p}`);
  }
  console.log(out);
}

run();
