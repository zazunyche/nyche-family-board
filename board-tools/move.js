#!/usr/bin/env node
/**
 * board-tools/move.js
 * Shorthand for the most common Zazu operation: moving a task to a new stage.
 * Wraps update.js for convenience with natural language stage names.
 *
 * Usage:
 *   node board-tools/move.js --task t_002 --to active --actor ZAZU
 *   node board-tools/move.js --task t_002 --to done   --actor DAD
 *   node board-tools/move.js --task t_002 --to research
 *
 * Stage aliases (case insensitive):
 *   idea / research / active / assigned / done
 */

const { execSync } = require("child_process");
const path         = require("path");

const args   = process.argv.slice(2);
const argVal = k => { const i = args.indexOf(k); return i>=0 ? args[i+1] : null; };

const TASK_ID = argVal("--task");
const TO      = argVal("--to")?.toUpperCase();
const ACTOR   = argVal("--actor") || "ZAZU";

const STAGE_ALIASES = {
  IDEA:     "IDEA",
  RESEARCH: "RESEARCH",
  ACTIVE:   "ACTIVE",
  ASSIGNED: "ASSIGNED",
  DONE:     "DONE",
};

if (!TASK_ID || !TO) {
  console.error("Usage: node board-tools/move.js --task <id> --to <stage> [--actor <name>]");
  process.exit(1);
}

const normalised = STAGE_ALIASES[TO];
if (!normalised) {
  console.error(`ERROR: unknown stage "${TO}". Valid: idea, research, active, assigned, done`);
  process.exit(1);
}

const updateScript = path.join(__dirname, "update.js");
try {
  const result = execSync(
    `node "${updateScript}" --task "${TASK_ID}" --stage "${normalised}" --actor "${ACTOR}"`,
    { encoding: "utf8" }
  );
  console.log(result.trim());
} catch(e) {
  console.error(e.message);
  process.exit(1);
}
