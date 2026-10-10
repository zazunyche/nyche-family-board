#!/usr/bin/env node
/**
 * board-tools/hermes-bridge.js
 * The hand-off lane between Zazu (Claude Code) and Hermes (local agent).
 *
 * GUARDRAILS baked in (see docs/hermes-guardrails.md):
 *  - Hermes is invoked ONE-SHOT, on demand (never a daemon; gateway stays OFF).
 *  - NEVER passes --yolo, so approval-gated/destructive tools are blocked (no TTY).
 *  - Restricted toolsets: 'core' for analysis, 'core,web,research' for research.
 *    terminal / code_execution / browser / computer_use are never loaded.
 *  - Runs in a scoped scratch dir (--in) so file access is limited to that job.
 *  - Local model only (qwen3:4b via Ollama) — raw data never leaves the Mac.
 *  - OUTPUT IS A PROPOSAL. This script never writes board-data.json directly on
 *    run/delegate; only `apply` mutates the board, and it does so via update.js
 *    (single-writer), after a human (Zazu) has reviewed.
 *
 * Usage:
 *   node hermes-bridge.js delegate --task t_x [--mode analysis|research] [--instructions "..."] [--input /abs/file]
 *   node hermes-bridge.js run      [--task t_x | --all]
 *   node hermes-bridge.js review   [--task t_x]
 *   node hermes-bridge.js apply    --task t_x [--done] [--reject]
 */

const fs   = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT        = path.join(__dirname, "..");
const DATA_FILE   = path.join(ROOT, "board-data.json");
const BRIDGE      = path.join(ROOT, "hermes-bridge");
const JOBS        = path.join(BRIDGE, "jobs");
const PROPOSALS   = path.join(BRIDGE, "proposals");
const SCRATCH     = path.join(BRIDGE, "scratch");
const APPLIED     = path.join(BRIDGE, "applied");
const HERMES      = path.join(process.env.HOME, ".local", "bin", "hermes");
const UPDATE_JS   = path.join(__dirname, "update.js");
// Per-mode routing. Toolsets (see toolsets.py): 'todo' = in-session only
// (no web/terminal/file → local-privacy boundary); 'safe' = web/vision/image,
// NO terminal/code. We NEVER load terminal/code_execution/browser/computer_use.
//   analysis → LOCAL (free, private) — for sensitive data, never leaves the Mac.
//   research → Nous Portal (economical cloud model) with web access.
// POLICY (Dad, 2026-10-10): only leave the local free model when the job needs
// web/Tool-Gateway, heavy reasoning beyond the local 4B, or a DIVERSE perspective.
// When Zazu (a Claude model) directs Hermes, route to a NON-Claude family (Qwen/Llama)
// — a second Claude adds little. Hence Qwen below, not Claude.
const ROUTES = {
  analysis: { provider: "ollama",   model: "qwen3:4b",          toolset: "todo" },
  research: { provider: "nousportal", model: "qwen/qwen3.8-flash", toolset: "safe" },
};
const RUN_TIMEOUT = 240000; // 4 min per job

[BRIDGE, JOBS, PROPOSALS, SCRATCH, APPLIED].forEach(d => fs.mkdirSync(d, { recursive: true }));

const args   = process.argv.slice(2);
const cmd    = args[0];
const argVal = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const hasFlag= k => args.includes(k);
const nowISO = () => new Date().toISOString();
const readBoard  = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const findTask   = (b, id) => b.tasks.find(t => t.id === id);

function sh(bin, argv) {
  return execFileSync(bin, argv, { encoding: "utf8", timeout: RUN_TIMEOUT, maxBuffer: 10 * 1024 * 1024 });
}

// ── delegate ─────────────────────────────────────────────────────────────────
function delegate() {
  const id = argVal("--task");
  if (!id) throw new Error("--task <id> required");
  const mode = (argVal("--mode") || "analysis").toLowerCase();
  if (!ROUTES[mode]) throw new Error(`--mode must be analysis|research`);
  const board = readBoard();
  const task  = findTask(board, id);
  if (!task) throw new Error(`task ${id} not found`);

  const input = argVal("--input");
  if (input && !fs.existsSync(input)) throw new Error(`--input file not found: ${input}`);

  const job = {
    taskId: id,
    title: task.title,
    notes: task.notes || "",
    mode,
    instructions: argVal("--instructions") || `Produce a ${mode} for this task.`,
    input: input || null,
    createdAt: nowISO(),
  };
  fs.writeFileSync(path.join(JOBS, `${id}.json`), JSON.stringify(job, null, 2));
  // Mark on the board via the single-writer tool (a note, not an owner change).
  sh("node", [UPDATE_JS, "--task", id, "--zazuNotes",
    `Delegated to Hermes (${mode}) — job queued ${nowISO()}`, "--actor", "ZAZU"]);
  console.log(`✓ delegated ${id} [${mode}] → hermes-bridge/jobs/${id}.json`);
}

// ── run ──────────────────────────────────────────────────────────────────────
function buildPrompt(job) {
  const parts = [
    `${job.mode === "research" ? "RESEARCH TASK" : "ANALYSIS TASK"}: ${job.title}`,
    job.notes ? `Context: ${job.notes}` : ``,
    ``,
    job.instructions,
  ];
  if (job.input) parts.push(``, `An input file is in your working directory as "input${path.extname(job.input)}". Read it if relevant.`);
  parts.push(``, `(Return your ${job.mode} as plain text only — do not run shell commands or write files; Zazu reviews before anything is applied.)`);
  return parts.filter(Boolean).join("\n");
}

function runJob(jobFile) {
  const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
  const scratch = path.join(SCRATCH, job.taskId);
  fs.mkdirSync(scratch, { recursive: true });
  if (job.input) fs.copyFileSync(job.input, path.join(scratch, `input${path.extname(job.input)}`));

  const route   = ROUTES[job.mode] || ROUTES.analysis;
  const prompt  = buildPrompt(job);
  // GUARDRAIL: no --yolo; restricted toolset; scoped cwd; per-mode provider/model.
  const argv = ["-z", prompt, "-t", route.toolset, "-m", route.model, "--provider", route.provider, "--in", scratch];
  let output, ok = true;
  try { output = sh(HERMES, argv); }
  catch (e) { ok = false; output = `ERROR invoking Hermes: ${e.message}\n${e.stdout || ""}`; }

  const proposal = {
    taskId: job.taskId, title: job.title, mode: job.mode,
    provider: route.provider, model: route.model, toolset: route.toolset,
    generatedAt: nowISO(), ok, proposal: (output || "").trim(),
  };
  fs.writeFileSync(path.join(PROPOSALS, `${job.taskId}.json`), JSON.stringify(proposal, null, 2));
  console.log(`${ok ? "✓" : "✗"} ran ${job.taskId} [${job.mode}] → hermes-bridge/proposals/${job.taskId}.json`);
}

function run() {
  const id = argVal("--task");
  if (id) { const f = path.join(JOBS, `${id}.json`); if (!fs.existsSync(f)) throw new Error(`no queued job for ${id}`); return runJob(f); }
  if (!hasFlag("--all")) throw new Error("pass --task <id> or --all");
  const files = fs.readdirSync(JOBS).filter(f => f.endsWith(".json"));
  if (!files.length) return console.log("no queued jobs.");
  files.forEach(f => runJob(path.join(JOBS, f)));
}

// ── review ───────────────────────────────────────────────────────────────────
function review() {
  const id = argVal("--task");
  const files = (id ? [`${id}.json`] : fs.readdirSync(PROPOSALS)).filter(f => f.endsWith(".json"));
  if (!files.length) return console.log("no proposals to review.");
  for (const f of files) {
    const p = JSON.parse(fs.readFileSync(path.join(PROPOSALS, f), "utf8"));
    console.log(`\n── ${p.taskId} [${p.mode}] ${p.ok ? "" : "(ERROR) "}${p.title}`);
    console.log(p.proposal.slice(0, 1200));
  }
}

// ── apply ────────────────────────────────────────────────────────────────────
function apply() {
  const id = argVal("--task");
  if (!id) throw new Error("--task <id> required");
  const pf = path.join(PROPOSALS, `${id}.json`);
  if (!fs.existsSync(pf)) throw new Error(`no proposal for ${id}`);
  const p = JSON.parse(fs.readFileSync(pf, "utf8"));

  if (hasFlag("--reject")) {
    fs.renameSync(pf, path.join(APPLIED, `${id}.rejected.json`));
    console.log(`✗ rejected proposal ${id} (archived).`);
  } else {
    const note = `Hermes ${p.mode} (${p.model}, ${p.generatedAt}): ${p.proposal}`.slice(0, 4000);
    const uArgs = [UPDATE_JS, "--task", id, "--zazuNotes", note, "--actor", "HERMES"];
    if (hasFlag("--done")) { uArgs.push("--stage", "DONE"); }
    sh("node", uArgs);
    fs.renameSync(pf, path.join(APPLIED, `${id}.applied.json`));
    console.log(`✓ applied Hermes proposal to ${id}${hasFlag("--done") ? " (→ DONE)" : ""}.`);
  }
  const jf = path.join(JOBS, `${id}.json`);
  if (fs.existsSync(jf)) fs.renameSync(jf, path.join(APPLIED, `${id}.job.json`));
}

try {
  if (cmd === "delegate") delegate();
  else if (cmd === "run") run();
  else if (cmd === "review") review();
  else if (cmd === "apply") apply();
  else { console.error("usage: hermes-bridge.js <delegate|run|review|apply> ..."); process.exit(1); }
} catch (e) { console.error(`ERROR: ${e.message}`); process.exit(1); }
