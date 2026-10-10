#!/usr/bin/env node
/**
 * board-tools/compose-brief.js
 * Deterministically renders the morning brief for DAD and MOM as a NUMBERED list,
 * and persists a number->taskId map for the day so that replies like "2 done"
 * can be resolved back to the real task id (see logs/brief-index.json).
 *
 * Why deterministic (not LLM-composed): the old `claude -p` composer was flaky
 * (frequent empty/malformed output -> useless fallback) AND could not guarantee a
 * stable number->id mapping. Rendering in code fixes both.
 *
 * Output (stdout) matches the format board-briefing.sh already parses:
 *   ===DAD===
 *   <dad message>
 *   ===MOM===
 *   <mom message>
 *   ===END===
 *
 * Usage:
 *   node board-tools/compose-brief.js                 # auto date (America/New_York)
 *   node board-tools/compose-brief.js --today 2026-10-09
 *   node board-tools/compose-brief.js --no-link       # omit board link
 */

const fs   = require("fs");
const path = require("path");

const DATA_FILE  = path.join(__dirname, "..", "board-data.json");
const INDEX_FILE = path.join(__dirname, "..", "logs", "brief-index.json");
const BOARD_URL  = "http://100.90.94.15:3000"; // Tailscale IP of the Mac

const args    = process.argv.slice(2);
const argVal  = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const hasFlag = k => args.includes(k);

// ── Date (America/New_York) ────────────────────────────────────────────────────
function nyToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
const TODAY = argVal("--today") || nyToday();
const WEEKDAY_LABEL = new Date(TODAY + "T12:00:00").toLocaleDateString("en-US", {
  weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York",
});

const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
};
const WEEK_AHEAD = addDays(TODAY, 7);

// ── Load board ──────────────────────────────────────────────────────────────────
const board = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const PRIORITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const BRIEF_DUE_HORIZON = addDays(TODAY, 14); // show future-dated items due within 14 days

const isSnoozed = t => t.snoozedUntil && t.snoozedUntil > TODAY;
const isOpen    = t => t.stage !== "DONE" && !isSnoozed(t);
// A task earns a spot in the DAILY brief if it's live work (ACTIVE/ASSIGNED) or
// time-sensitive (overdue / due within 14 days). Far-future backlog (IDEA, etc.)
// stays on the board page so the morning list stays short.
const isBriefWorthy = t =>
  isOpen(t) && (
    t.stage === "ACTIVE" || t.stage === "ASSIGNED" ||
    (t.dueDate && t.dueDate <= BRIEF_DUE_HORIZON)
  );

function ownerTasks(owner) {
  return board.tasks.filter(t => isBriefWorthy(t) && (t.owner === owner || t.owner === "BOTH"));
}

function daysOverdue(t) {
  const d1 = new Date(t.dueDate + "T12:00:00Z");
  const d0 = new Date(TODAY + "T12:00:00Z");
  return Math.round((d0 - d1) / 86400000);
}
function prettyDue(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "America/New_York",
  });
}

function sortTasks(list) {
  return list.slice().sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (pr) return pr;
    if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

// ── Build one person's message + index ───────────────────────────────────────────
function buildFor(owner, friendlyName) {
  const tasks = ownerTasks(owner);

  const overdue  = sortTasks(tasks.filter(t => t.dueDate && t.dueDate < TODAY));
  const thisWeek = sortTasks(tasks.filter(t => t.dueDate && t.dueDate >= TODAY && t.dueDate <= WEEK_AHEAD));
  const later    = sortTasks(tasks.filter(t => t.dueDate && t.dueDate > WEEK_AHEAD));
  const noDue    = sortTasks(tasks.filter(t => !t.dueDate));

  const lines = [`☀️ Morning, ${friendlyName} — ${WEEKDAY_LABEL}`, ""];
  const index = {}; // number -> {id, title}
  let n = 0;

  const emit = (header, group, suffixFn) => {
    if (!group.length) return;
    lines.push(header);
    for (const t of group) {
      n += 1;
      index[n] = { id: t.id, title: t.title };
      const suffix = suffixFn ? suffixFn(t) : "";
      lines.push(`${n}. ${t.title}${suffix}`);
    }
    lines.push("");
  };

  if (!overdue.length && !thisWeek.length && !later.length && !noDue.length) {
    lines.push("✅ All clear — nothing open. Enjoy the day!");
  } else {
    emit("🚨 Overdue", overdue, t => ` — ${daysOverdue(t)}d overdue`);
    emit("📅 This week", thisWeek, t => ` — due ${prettyDue(t.dueDate)}`);
    emit("🔧 Open", noDue, null);
    emit("🗓️ Later", later, t => ` — due ${prettyDue(t.dueDate)}`);
    lines.push(`↩️ Reply e.g. "2 done" or "3 snooze 3d" and I'll update the board.`);
  }

  if (!hasFlag("--no-link")) {
    lines.push("");
    lines.push(`📋 Full board → ${BOARD_URL}`);
  }
  lines.push("— Zazu");

  return { message: lines.join("\n"), index };
}

const dad = buildFor("DAD", board.settings?.owners?.DAD?.name || "Dad");
const mom = buildFor("MOM", board.settings?.owners?.MOM?.name || "Mom");

// ── Persist the day's number->id map ──────────────────────────────────────────────
const indexPayload = {
  today: TODAY,
  generatedAt: new Date().toISOString(),
  DAD: dad.index,
  MOM: mom.index,
};
try {
  fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexPayload, null, 2));
} catch (e) {
  process.stderr.write(`WARNING: could not write brief index: ${e.message}\n`);
}

// ── Emit in the format board-briefing.sh expects ──────────────────────────────────
process.stdout.write(
  `===DAD===\n${dad.message}\n===MOM===\n${mom.message}\n===END===\n`
);
