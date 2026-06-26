#!/usr/bin/env node
/**
 * board-tools/zazu-context.js
 * Outputs a structured context block for embedding in `claude -p` prompts.
 * This is what all launchd one-shots inject into Zazu's prompts so she has
 * full board awareness without needing to read files herself.
 *
 * Usage:
 *   node board-tools/zazu-context.js              → full context block (default)
 *   node board-tools/zazu-context.js --brief       → condensed: urgent + stalled only
 *   node board-tools/zazu-context.js --owner DAD   → filter to Dad's tasks
 *   node board-tools/zazu-context.js --owner MOM   → filter to Mom's tasks
 *   node board-tools/zazu-context.js --json        → raw JSON (for programmatic use)
 *
 * Output is designed to be shell-captured and embedded in prompts:
 *   BOARD_CONTEXT=$(node board-tools/zazu-context.js)
 *   claude -p "...$BOARD_CONTEXT..."
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "board-data.json");

const args    = process.argv.slice(2);
const BRIEF   = args.includes("--brief");
const JSON_OUT= args.includes("--json");
const argVal  = k => { const i = args.indexOf(k); return i>=0 ? args[i+1] : null; };
const OWNER   = argVal("--owner")?.toUpperCase();

// ── Load ──────────────────────────────────────────────────────────────────────
let board;
try {
  board = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch(e) {
  process.stderr.write(`ERROR: Could not read board-data.json: ${e.message}\n`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr     = () => new Date().toISOString().split("T")[0];
const daysSince    = d  => d ? Math.floor((Date.now()-new Date(d).getTime())/86400000) : 0;
const staleThresh  = board.settings?.staleThresholdDays || 7;

function isOverdue(t) {
  return t.dueDate && t.dueDate < todayStr()
    && t.stage !== "DONE" && !t.snoozedUntil;
}
function isStale(t) {
  return !isOverdue(t) && t.stage !== "DONE" && !t.snoozedUntil
    && daysSince(t.updatedAt) >= staleThresh;
}
function dueSoon(t, days = 7) {
  if (!t.dueDate || isOverdue(t) || t.stage === "DONE") return false;
  const diff = (new Date(t.dueDate) - new Date(todayStr())) / 86400000;
  return diff >= 0 && diff <= days;
}

// ── Filter tasks ──────────────────────────────────────────────────────────────
let tasks = board.tasks;
if (OWNER) {
  tasks = tasks.filter(t => t.owner === OWNER || t.owner === "BOTH");
}

const open     = tasks.filter(t => t.stage !== "DONE");
const overdue  = tasks.filter(t => isOverdue(t));
const stale    = tasks.filter(t => isStale(t));
const inWeek   = tasks.filter(t => dueSoon(t, 7) && !isOverdue(t));
const snoozed  = open.filter(t => t.snoozedUntil && t.snoozedUntil > todayStr());

// ── Pending reminders due today or tomorrow ───────────────────────────────────
const tomorrow     = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
const tomorrowStr  = tomorrow.toISOString().split("T")[0];
const pendingToday = (board.pendingReminders || []).filter(r =>
  !r.sent && (r.sendDate === todayStr() || r.sendDate === tomorrowStr)
);

// ── JSON output ───────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    boardDate:   todayStr(),
    counts: { open: open.length, overdue: overdue.length, stale: stale.length, dueThisWeek: inWeek.length },
    overdue:  overdue.map(t => ({ id:t.id, title:t.title, owner:t.owner, dueDate:t.dueDate, daysOverdue:daysSince(t.dueDate), priority:t.priority, notes:t.notes, zazuNotes:t.zazuNotes })),
    stale:    stale.map(t  => ({ id:t.id, title:t.title, owner:t.owner, stage:t.stage, daysIdle:daysSince(t.updatedAt), priority:t.priority, notes:t.notes, zazuNotes:t.zazuNotes })),
    dueThisWeek: inWeek.map(t => ({ id:t.id, title:t.title, owner:t.owner, dueDate:t.dueDate, stage:t.stage })),
    allOpen:  open.map(t  => {
      const subs = t.subtasks || [];
      const nextSub = subs.find(s => s.stage !== "DONE") || null;
      return { id:t.id, title:t.title, stage:t.stage, owner:t.owner, category:t.category, priority:t.priority, dueDate:t.dueDate, daysIdle:daysSince(t.updatedAt), isStale:isStale(t), isOverdue:isOverdue(t), notes:t.notes, zazuNotes:t.zazuNotes, subtaskCount: subs.length, subtaskDoneCount: subs.filter(s=>s.stage==="DONE").length, nextSubtask: nextSub ? { id: nextSub.id, title: nextSub.title } : null };
    }),
    vehicles: board.vehicles,
    pendingReminders: pendingToday,
    goals:    board.goals,
    dadTasks: open.filter(t=>t.owner==="DAD"||t.owner==="BOTH").map(t=>({id:t.id,title:t.title,stage:t.stage,dueDate:t.dueDate,priority:t.priority})),
    momTasks: open.filter(t=>t.owner==="MOM"||t.owner==="BOTH").map(t=>({id:t.id,title:t.title,stage:t.stage,dueDate:t.dueDate,priority:t.priority})),
  }, null, 2));
  process.exit(0);
}

// ── Text context block ────────────────────────────────────────────────────────
const lines = [];

lines.push(`<board_context>`);
lines.push(`Generated: ${new Date().toISOString()} | Board: Nyche Family Board | Today: ${todayStr()}`);
lines.push(``);

// Always include counts as a quick summary
lines.push(`SUMMARY: ${open.length} open tasks | ${overdue.length} overdue | ${stale.length} stalled | ${inWeek.length} due this week`);
lines.push(``);

// ── Overdue — always show ──────────────────────────────────────────────────
if (overdue.length) {
  lines.push(`OVERDUE (${overdue.length}) — surface these first in any briefing:`);
  overdue.forEach(t => {
    lines.push(`  [${t.id}] ${t.title}`);
    lines.push(`    Owner: ${t.owner} | Due: ${t.dueDate} | ${daysSince(t.dueDate)} days overdue | Priority: ${t.priority}`);
    if (t.notes)     lines.push(`    Notes: ${t.notes}`);
    if (t.zazuNotes) lines.push(`    Zazu notes: ${t.zazuNotes}`);
  });
  lines.push(``);
} else {
  lines.push(`OVERDUE: none ✓`);
  lines.push(``);
}

// ── Stalled ────────────────────────────────────────────────────────────────
if (stale.length) {
  lines.push(`STALLED (${stale.length}) — no update in ${staleThresh}+ days:`);
  stale.forEach(t => {
    lines.push(`  [${t.id}] ${t.title}`);
    lines.push(`    Owner: ${t.owner} | Stage: ${t.stage} | Idle: ${daysSince(t.updatedAt)} days | Category: ${t.category}`);
    if (t.notes)     lines.push(`    Notes: ${t.notes}`);
    if (t.zazuNotes) lines.push(`    Zazu notes: ${t.zazuNotes}`);
  });
  lines.push(``);
} else {
  lines.push(`STALLED: none ✓`);
  lines.push(``);
}

// ── Due this week (skip if brief mode) ────────────────────────────────────
if (!BRIEF && inWeek.length) {
  lines.push(`DUE THIS WEEK (${inWeek.length}):`);
  inWeek.forEach(t => {
    lines.push(`  [${t.id}] ${t.title} — ${t.dueDate} | Owner: ${t.owner}`);
  });
  lines.push(``);
}

// ── Pending reminders firing today/tomorrow ────────────────────────────────
if (pendingToday.length) {
  lines.push(`REMINDERS DUE TODAY OR TOMORROW (${pendingToday.length}) — send these:`);
  pendingToday.forEach(r => {
    lines.push(`  [${r.id}] To: ${r.owner} (${r.handle}) on ${r.sendDate}`);
    lines.push(`    "${r.message}"`);
  });
  lines.push(``);
}

// ── All open tasks (skip if brief mode) ───────────────────────────────────
if (!BRIEF) {
  lines.push(`ALL OPEN TASKS (${open.length}):`);
  const byOwner = { DAD:[], MOM:[], BOTH:[], ZAZU:[] };
  open.forEach(t => { (byOwner[t.owner] || byOwner.BOTH).push(t); });

  ["DAD","MOM","BOTH","ZAZU"].forEach(owner => {
    const ownerTasks = byOwner[owner];
    if (!ownerTasks.length) return;
    lines.push(`  ${owner}:`);
    ownerTasks.forEach(t => {
      const flags = [
        isOverdue(t) ? "⚠ OVERDUE" : null,
        isStale(t)   ? `💤 ${daysSince(t.updatedAt)}d idle` : null,
        t.dueDate && !isOverdue(t) ? `due ${t.dueDate}` : null,
      ].filter(Boolean).join(" | ");
      lines.push(`    [${t.id}] [${t.stage}] ${t.title}${flags ? " — " + flags : ""}`);
      // Show next incomplete subtask if any
      const subs = t.subtasks || [];
      const nextSub = subs.find(s => s.stage !== "DONE");
      if (nextSub) {
        const doneCount = subs.filter(s => s.stage === "DONE").length;
        lines.push(`      → NEXT SUBTASK (${doneCount}/${subs.length} done): ${nextSub.title} [${nextSub.id}]`);
      }
    });
  });
  lines.push(``);
}

// ── Vehicles ───────────────────────────────────────────────────────────────
if (board.vehicles?.length) {
  const vehicleAlerts = board.vehicles.filter(v => {
    if (!v.registrationDue) return false;
    return Math.floor((new Date(v.registrationDue)-Date.now())/86400000) <= 60;
  });
  if (vehicleAlerts.length) {
    lines.push(`VEHICLE ALERTS:`);
    vehicleAlerts.forEach(v => {
      const daysLeft = Math.floor((new Date(v.registrationDue)-Date.now())/86400000);
      lines.push(`  ${v.nickname}: registration due ${v.registrationDue} (${daysLeft<0?Math.abs(daysLeft)+"d OVERDUE":daysLeft+"d remaining"})`);
    });
    lines.push(``);
  }
}

// ── Snoozed (so Zazu knows what she's intentionally skipping) ─────────────
if (snoozed.length) {
  lines.push(`SNOOZED (${snoozed.length}) — intentionally deferred:`);
  snoozed.forEach(t => {
    lines.push(`  [${t.id}] ${t.title} — snoozed until ${t.snoozedUntil}`);
  });
  lines.push(``);
}

// ── Board tool reference (so Zazu knows how to update) ────────────────────
lines.push(`BOARD TOOLS (call these to update the board):`);
lines.push(`  Add task:      node ~/Documents/src/family-board/board-tools/add.js --title "..." --category HOME --owner DAD --priority MEDIUM --stage IDEA --actor ZAZU`);
lines.push(`  Move stage:    node ~/Documents/src/family-board/board-tools/move.js --task <id> --to <stage> --actor ZAZU`);
lines.push(`  Update task:   node ~/Documents/src/family-board/board-tools/update.js --task <id> --owner MOM --notes "..." --actor ZAZU`);
lines.push(`  Snooze:        node ~/Documents/src/family-board/board-tools/update.js --task <id> --snooze 2025-07-01 --actor ZAZU`);
lines.push(`  Mark done:     node ~/Documents/src/family-board/board-tools/move.js --task <id> --to done --actor ZAZU`);
lines.push(`  Mark reminded: node ~/Documents/src/family-board/board-tools/mark-reminded.js --reminder <id>`);
lines.push(`  Add subtask:   node ~/Documents/src/family-board/board-tools/subtask.js --task <id> --add "subtask title" --actor ZAZU`);
lines.push(`  Done subtask:  node ~/Documents/src/family-board/board-tools/subtask.js --task <id> --done <subtask-id> --actor ZAZU`);
lines.push(`  List subtasks: node ~/Documents/src/family-board/board-tools/subtask.js --task <id> --list`);
lines.push(``);
lines.push(`</board_context>`);

console.log(lines.join("\n"));
