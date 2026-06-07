#!/usr/bin/env node
/**
 * board-tools/read.js
 * Zazu calls this to read the current board state.
 *
 * Usage:
 *   node board-tools/read.js                  → full briefing JSON to stdout
 *   node board-tools/read.js --text           → human-readable plain text
 *   node board-tools/read.js --owner DAD      → filter to Dad's tasks
 *   node board-tools/read.js --owner MOM      → filter to Mom's tasks
 *   node board-tools/read.js --stage RESEARCH → tasks in a specific stage
 *   node board-tools/read.js --task t_001     → single task detail
 */

const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "board-data.json");

// ── Parse args ───────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const flag    = v => args.includes(v);
const argVal  = k => { const i = args.indexOf(k); return i>=0 ? args[i+1] : null; };
const TEXT    = flag("--text");
const OWNER   = argVal("--owner")?.toUpperCase();
const STAGE   = argVal("--stage")?.toUpperCase();
const TASK_ID = argVal("--task");

// ── Load ─────────────────────────────────────────────────────────────────────
let board;
try {
  board = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch(e) {
  console.error("ERROR: Could not read board-data.json:", e.message);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr  = () => new Date().toISOString().split("T")[0];
const daysSince = d  => d ? Math.floor((Date.now()-new Date(d).getTime())/86400000) : 0;
const staleThreshold = board.settings?.staleThresholdDays || 7;

function isOverdue(t) {
  return t.dueDate && t.dueDate < todayStr() && t.stage !== "DONE" && !t.snoozedUntil;
}
function isStale(t) {
  return !isOverdue(t) && t.stage !== "DONE" && !t.snoozedUntil
    && daysSince(t.updatedAt) >= staleThreshold;
}

// ── Single task lookup ────────────────────────────────────────────────────────
if (TASK_ID) {
  const t = board.tasks.find(t => t.id === TASK_ID);
  if (!t) { console.error(`Task ${TASK_ID} not found`); process.exit(1); }
  if (TEXT) {
    console.log(`\n── Task: ${t.title} ──`);
    console.log(`ID:        ${t.id}`);
    console.log(`Stage:     ${t.stage}`);
    console.log(`Owner:     ${t.owner}`);
    console.log(`Priority:  ${t.priority}`);
    console.log(`Category:  ${t.category}`);
    console.log(`Due:       ${t.dueDate || "none"}`);
    console.log(`Overdue:   ${isOverdue(t) ? "YES — " + daysSince(t.dueDate) + " days" : "no"}`);
    console.log(`Stale:     ${isStale(t)   ? "YES — " + daysSince(t.updatedAt) + " days idle" : "no"}`);
    console.log(`Notes:     ${t.notes || "(none)"}`);
    console.log(`Zazu notes:${t.zazuNotes || "(none)"}`);
    console.log(`Created:   ${t.createdAt}`);
    console.log(`Updated:   ${t.updatedAt}`);
    console.log(`\nHistory:`);
    (t.history||[]).forEach(h => console.log(`  ${h.timestamp}  [${h.actor}]  ${h.change}`));
  } else {
    console.log(JSON.stringify(t, null, 2));
  }
  process.exit(0);
}

// ── Build dataset ─────────────────────────────────────────────────────────────
let tasks = board.tasks;
if (OWNER) tasks = tasks.filter(t => t.owner === OWNER || t.owner === "BOTH");
if (STAGE) tasks = tasks.filter(t => t.stage === STAGE);

const open       = tasks.filter(t => t.stage !== "DONE");
const overdue    = tasks.filter(t => isOverdue(t));
const stale      = tasks.filter(t => isStale(t));
const snoozed    = open.filter(t => t.snoozedUntil && t.snoozedUntil > todayStr());
const inWeek     = open.filter(t => {
  if (!t.dueDate || isOverdue(t)) return false;
  const diff = (new Date(t.dueDate) - new Date(todayStr())) / 86400000;
  return diff >= 0 && diff <= 7;
});

// ── JSON output ───────────────────────────────────────────────────────────────
if (!TEXT) {
  const out = {
    generatedAt: new Date().toISOString(),
    boardDate:   todayStr(),
    filters: { owner: OWNER||"ALL", stage: STAGE||"ALL" },
    counts: {
      open:        open.length,
      overdue:     overdue.length,
      stale:       stale.length,
      dueThisWeek: inWeek.length,
      snoozed:     snoozed.length,
      done:        tasks.filter(t=>t.stage==="DONE").length,
    },
    overdue: overdue.map(t => ({
      id: t.id, title: t.title, owner: t.owner,
      dueDate: t.dueDate, daysOverdue: daysSince(t.dueDate),
      priority: t.priority, category: t.category, notes: t.notes
    })),
    stale: stale.map(t => ({
      id: t.id, title: t.title, owner: t.owner,
      stage: t.stage, daysIdle: daysSince(t.updatedAt),
      priority: t.priority, category: t.category, notes: t.notes
    })),
    dueThisWeek: inWeek.map(t => ({
      id: t.id, title: t.title, owner: t.owner,
      dueDate: t.dueDate, stage: t.stage
    })),
    allOpen: open.map(t => ({
      id: t.id, title: t.title, stage: t.stage, owner: t.owner,
      category: t.category, priority: t.priority, dueDate: t.dueDate,
      daysIdle: daysSince(t.updatedAt), isStale: isStale(t), isOverdue: isOverdue(t),
      notes: t.notes, zazuNotes: t.zazuNotes
    })),
    vehicles: board.vehicles,
    goals: board.goals,
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// ── Plain text output (Zazu morning digest) ───────────────────────────────────
const lines = [];
const sep   = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

lines.push(`🏠 NYCHE FAMILY BOARD — ${todayStr()}`);
lines.push(sep);
lines.push("");

if (overdue.length) {
  lines.push(`🚨 URGENT — ${overdue.length} OVERDUE ITEM${overdue.length > 1 ? "S" : ""}`);
  overdue.forEach(t => {
    lines.push(`  • [${t.owner}] ${t.title}`);
    lines.push(`    Due ${t.dueDate} · ${daysSince(t.dueDate)} days overdue · ${t.priority} priority`);
    if (t.notes) lines.push(`    ${t.notes}`);
  });
  lines.push("");
}

if (stale.length) {
  lines.push(`💤 STALLED — ${stale.length} ITEM${stale.length > 1 ? "S" : ""} IDLE 7+ DAYS`);
  stale.forEach(t => {
    lines.push(`  • [${t.owner}] ${t.title}`);
    lines.push(`    Stage: ${t.stage} · ${daysSince(t.updatedAt)} days idle · ${t.category}`);
    if (t.notes) lines.push(`    ${t.notes}`);
  });
  lines.push("");
}

if (inWeek.length) {
  lines.push(`📅 DUE THIS WEEK`);
  inWeek.forEach(t => {
    lines.push(`  • [${t.owner}] ${t.title} → ${t.dueDate}`);
  });
  lines.push("");
}

if (!overdue.length && !stale.length && !inWeek.length) {
  lines.push(`✅ All clear — no urgent, stalled, or upcoming items today.`);
  lines.push("");
}

const dadTasks = open.filter(t => t.owner === "DAD" || t.owner === "BOTH");
const momTasks = open.filter(t => t.owner === "MOM" || t.owner === "BOTH");

if (!OWNER || OWNER === "DAD") {
  lines.push(`👤 DAD — ${dadTasks.length} open task${dadTasks.length !== 1 ? "s" : ""}`);
  dadTasks.forEach(t => {
    const flag = isOverdue(t) ? " ⚠ OVERDUE" : isStale(t) ? " 💤 stalled" : "";
    lines.push(`  • [${t.stage}] ${t.title}${t.dueDate?" — due "+t.dueDate:""}${flag}`);
  });
  lines.push("");
}

if (!OWNER || OWNER === "MOM") {
  lines.push(`👤 MOM — ${momTasks.length} open task${momTasks.length !== 1 ? "s" : ""}`);
  momTasks.forEach(t => {
    const flag = isOverdue(t) ? " ⚠ OVERDUE" : isStale(t) ? " 💤 stalled" : "";
    lines.push(`  • [${t.stage}] ${t.title}${t.dueDate?" — due "+t.dueDate:""}${flag}`);
  });
  lines.push("");
}

// Vehicle reminder
board.vehicles.forEach(v => {
  if (v.registrationDue) {
    const daysLeft = Math.floor((new Date(v.registrationDue)-Date.now())/86400000);
    if (daysLeft < 30) {
      lines.push(`🚗 VEHICLE REMINDER: ${v.nickname} registration due ${v.registrationDue} (${daysLeft < 0 ? Math.abs(daysLeft)+"d OVERDUE" : daysLeft+"d remaining"})`);
      lines.push("");
    }
  }
});

lines.push(sep);
lines.push(`${open.length} open tasks · ${tasks.filter(t=>t.stage==="DONE").length} done · Stale threshold: ${staleThreshold} days`);

console.log(lines.join("\n"));
