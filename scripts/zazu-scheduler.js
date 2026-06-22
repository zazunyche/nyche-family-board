#!/usr/bin/env node
/**
 * scripts/zazu-scheduler.js
 *
 * Long-running scheduler daemon (Node, not bash) — replaces launchd's
 * StartCalendarInterval for all heavier Zazu scripts.
 *
 * WHY THIS EXISTS (found 2026-06-22): isolated, reproducible proof that
 * launchd directly exec'ing /bin/bash for non-trivial scripts under
 * ~/Documents/src/family-board fails 100% of the time in this environment
 * ("Interrupted system call" / "Operation not permitted" at process
 * startup, before the script's own first line even runs) — regardless of
 * caffeinate wrapping, retry-loop wrapping, or WorkingDirectory settings,
 * all tested and ruled out individually. Meanwhile:
 *   - launchd directly exec'ing /usr/bin/env node (com.zazu.board-server)
 *     has run reliably for days.
 *   - bash spawned as a CHILD of an already-running process (manual runs
 *     from an interactive shell, or child_process from Node) succeeds
 *     100% of the time.
 * So: this daemon is Node, launched once via RunAtLoad + KeepAlive (the
 * proven pattern), and never exits. It checks the clock every 30s and
 * spawns the actual bash scripts as child processes of itself — which
 * matches the success pattern, not the failure pattern.
 *
 * Each job fires at most once per calendar day, tracked via a marker file
 * in /tmp (wiped on reboot, which is fine — harmless to re-fire once after
 * a same-day reboot).
 */

"use strict";

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const BOARD_DIR = "/Users/zazunyche/Documents/src/family-board";
const HOME = "/Users/zazunyche";
const LOG = path.join(BOARD_DIR, "logs", "scheduler.log");

// Per-child safety limits. A hung or chatty child must never be able to
// wedge or crash the scheduler itself.
const CHILD_TIMEOUT_MS = 10 * 60 * 1000; // 10 min — generous for claude -p / gmail scans
const CHILD_MAX_BUFFER = 10 * 1024 * 1024; // 10MB stdout+stderr

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG, line);
  } catch (e) {
    // Logging must never be able to crash the process. Fall back to
    // stderr (captured by launchd's StandardErrorPath) and move on.
    try { console.error(line.trim(), "(log write failed:", e.message + ")"); } catch (_) { /* truly give up */ }
  }
}

// ── Process-level safety net ───────────────────────────────────────────────
// This is a single long-running process responsible for every scheduled
// job. Nothing a child process does — crash, hang, throw, reject — may be
// allowed to take the parent down, because that would silently kill every
// future job too, not just the one that's misbehaving. Belt-and-suspenders:
// every async/callback path below already catches its own errors, but these
// two handlers are the last line of defense for anything that slips through.
process.on("uncaughtException", (err) => {
  log(`UNCAUGHT EXCEPTION (scheduler survived, not exiting): ${err && err.stack ? err.stack : err}`);
});
process.on("unhandledRejection", (reason) => {
  log(`UNHANDLED REJECTION (scheduler survived, not exiting): ${reason && reason.stack ? reason.stack : reason}`);
});

log(`zazu-scheduler.js starting up (pid ${process.pid})`);

function pad(n) { return String(n).padStart(2, "0"); }

function nowHM() {
  const d = new Date();
  // System is already in the Mac's local timezone (ET) — no conversion needed.
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function runOnce(name, scriptPath) {
  const marker = `/tmp/zazu-ran-${name}-${today()}`;
  if (fs.existsSync(marker)) return;
  try {
    fs.writeFileSync(marker, "");
  } catch (e) {
    log(`ERROR: could not write marker for ${name}, skipping this run to avoid retry-storm: ${e.message}`);
    return;
  }
  log(`Triggering ${name} (${scriptPath})`);

  let child;
  try {
    child = exec(
      `/bin/bash "${scriptPath}" >> "${LOG}" 2>&1`,
      {
        cwd: BOARD_DIR,
        env: { ...process.env, HOME, PATH: `${HOME}/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` },
        timeout: CHILD_TIMEOUT_MS,     // hard cap — a hung child gets SIGTERM'd, never lingers forever
        maxBuffer: CHILD_MAX_BUFFER,
        killSignal: "SIGTERM",
      },
      (err) => {
        if (err) {
          const why = err.killed ? `killed (signal ${err.signal || "?"}, likely timeout)` : `exit ${err.code}`;
          log(`${name} FAILED — ${why}: ${err.message.split("\n")[0]}`);
        } else {
          log(`${name} finished, exit 0`);
        }
      }
    );
  } catch (e) {
    // exec() itself threw synchronously (extremely rare — e.g. EAGAIN under
    // resource exhaustion). Caught here so it can never propagate up into
    // the tick()/setInterval call stack and take the scheduler down.
    log(`ERROR: failed to spawn ${name}: ${e.message}`);
    return;
  }

  // exec() returns an EventEmitter — an unhandled 'error' event on it would
  // otherwise throw and crash the process. Always have a listener.
  if (child) {
    child.on("error", (e) => {
      log(`ERROR: child process error for ${name}: ${e.message}`);
    });
  }
}

const GMAIL_TIMES = ["07:30", "09:30", "11:30", "13:30", "15:30", "17:30", "19:30", "21:00"];
const HEALTH_TIMES = ["07:30", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00", "21:00"];

function tickInner() {
  const hm = nowHM();

  if (hm === "07:00") {
    runOnce("daily-briefing", `${HOME}/.claude/daily-briefing.sh`);
    runOnce("board-briefing", `${BOARD_DIR}/scripts/board-briefing.sh`);
  }
  if (hm === "08:00") {
    runOnce("board-reminders", `${BOARD_DIR}/scripts/board-reminders.sh`);
  }
  if (hm === "08:57") {
    runOnce("daily-learning", `${BOARD_DIR}/scripts/daily-learning.sh`);
  }
  if (hm === "00:00") {
    runOnce("midnight-commit", `${BOARD_DIR}/scripts/midnight-commit.sh`);
  }
  if (GMAIL_TIMES.includes(hm)) {
    runOnce(`gmail-scan-${hm}`, `${BOARD_DIR}/scripts/gmail-scan.sh`);
  }
  if (HEALTH_TIMES.includes(hm)) {
    runOnce(`health-check-${hm}`, `${BOARD_DIR}/scripts/health-check.sh`);
  }
}

// tick() is the setInterval callback — Node does NOT catch synchronous
// throws inside interval callbacks, so without this try/catch any unguarded
// exception here would crash the entire scheduler (taking down every future
// job with it, not just the one tick). Last layer before the process-level
// uncaughtException handler above.
function tick() {
  try {
    tickInner();
  } catch (e) {
    log(`ERROR: tick() threw (scheduler survived, not exiting): ${e && e.stack ? e.stack : e}`);
  }
}

setInterval(tick, 30 * 1000);
tick(); // also check immediately on startup in case we started mid-minute
