#!/usr/bin/env node
/**
 * board-tools/add.js
 * Zazu calls this to add a new task to the board.
 *
 * Usage:
 *   node board-tools/add.js \
 *     --title "Call HVAC company for quote" \
 *     --category HOME \
 *     --owner DAD \
 *     --priority MEDIUM \
 *     --stage ACTIVE \
 *     --due 2025-06-10 \
 *     --notes "Carrier unit making noise. Call Mike at Atlanta HVAC: 404-555-0191" \
 *     --source imessage \
 *     --actor ZAZU
 *
 * Required: --title
 * Optional: --category (HOME|VEHICLES|FAMILY|ADMIN|YARD|GOALS, default HOME)
 *           --owner    (DAD|MOM|BOTH|ZAZU, default DAD)
 *           --priority (HIGH|MEDIUM|LOW, default MEDIUM)
 *           --stage    (IDEA|RESEARCH|ACTIVE|ASSIGNED|DONE, default IDEA)
 *           --due      (YYYY-MM-DD)
 *           --notes    (free text)
 *           --source   (manual|imessage|calendar|email, default manual)
 *           --recurrence (yearly|quarterly|monthly)
 *           --actor    (who is adding — default ZAZU)
 *
 * Prints the new task ID to stdout on success.
 */

const fs   = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "board-data.json");

const args   = process.argv.slice(2);
const argVal = k => { const i = args.indexOf(k); return i>=0 ? args[i+1] : null; };

const TITLE      = argVal("--title");
const CATEGORY   = argVal("--category")?.toUpperCase()  || "HOME";
const OWNER      = argVal("--owner")?.toUpperCase()     || "DAD";
const PRIORITY   = argVal("--priority")?.toUpperCase()  || "MEDIUM";
const STAGE      = argVal("--stage")?.toUpperCase()     || "IDEA";
const DUE        = argVal("--due")        || null;
const NOTES      = argVal("--notes")      || "";
const SOURCE     = argVal("--source")     || "manual";
const RECURRENCE = argVal("--recurrence") || null;
const ACTOR      = argVal("--actor")      || "ZAZU";

// ── Validate ──────────────────────────────────────────────────────────────────
if (!TITLE) {
  console.error("ERROR: --title is required");
  process.exit(1);
}

const VALID_STAGES = ["IDEA","RESEARCH","ACTIVE","ASSIGNED","DONE"];
const VALID_CATS   = ["HOME","VEHICLES","FAMILY","ADMIN","YARD","GOALS"];
const VALID_OWNERS = ["DAD","MOM","BOTH","ZAZU"];
const VALID_PRI    = ["HIGH","MEDIUM","LOW"];

if (!VALID_STAGES.includes(STAGE))    { console.error(`ERROR: invalid stage "${STAGE}"`);    process.exit(1); }
if (!VALID_CATS.includes(CATEGORY))   { console.error(`ERROR: invalid category "${CATEGORY}"`); process.exit(1); }
if (!VALID_OWNERS.includes(OWNER))    { console.error(`ERROR: invalid owner "${OWNER}"`);    process.exit(1); }
if (!VALID_PRI.includes(PRIORITY))    { console.error(`ERROR: invalid priority "${PRIORITY}"`); process.exit(1); }

// ── Load ──────────────────────────────────────────────────────────────────────
let board;
try {
  board = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch(e) {
  console.error("ERROR: Could not read board-data.json:", e.message);
  process.exit(1);
}

// ── Create task ───────────────────────────────────────────────────────────────
const nowISO = new Date().toISOString();
const id     = "t_" + Math.random().toString(36).slice(2, 9);

const task = {
  id,
  title:           TITLE,
  notes:           NOTES,
  category:        CATEGORY,
  stage:           STAGE,
  priority:        PRIORITY,
  owner:           OWNER,
  dueDate:         DUE,
  createdAt:       nowISO,
  updatedAt:       nowISO,
  completedAt:     STAGE === "DONE" ? nowISO : null,
  snoozedUntil:    null,
  recurrence:      RECURRENCE,
  recurrenceMonth: null,
  source:          SOURCE,
  zazuNotes:       "",
  lastBriefed:     null,
  briefCount:      0,
  vendorId:        null,
  blockedBy:       null,
  history: [
    {
      timestamp: nowISO,
      actor:     ACTOR,
      change:    `Task created via ${SOURCE}. stage: ${STAGE}, owner: ${OWNER}`
    }
  ]
};

board.tasks.push(task);
board.meta.lastUpdated   = nowISO;
board.meta.lastUpdatedBy = ACTOR;

// ── Write atomically ──────────────────────────────────────────────────────────
const tmp = DATA_FILE + ".tmp";
try {
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
} catch(e) {
  console.error("ERROR: Write failed:", e.message);
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  process.exit(1);
}

console.log(id);
process.stderr.write(`✓ Added task: "${TITLE}" [${id}] → ${STAGE}, owner: ${OWNER}\n`);
