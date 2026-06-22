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

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG, line);
}

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
  fs.writeFileSync(marker, "");
  log(`Triggering ${name} (${scriptPath})`);
  const child = exec(
    `/bin/bash "${scriptPath}" >> "${LOG}" 2>&1`,
    { cwd: BOARD_DIR, env: { ...process.env, HOME, PATH: `${HOME}/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` } },
    (err) => {
      log(`${name} finished, exit ${err ? err.code : 0}`);
    }
  );
}

const GMAIL_TIMES = ["07:30", "09:30", "11:30", "13:30", "15:30", "17:30", "19:30", "21:00"];
const HEALTH_TIMES = ["07:30", "09:00", "11:00", "13:00", "15:00", "17:00", "19:00", "21:00"];

function tick() {
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

setInterval(tick, 30 * 1000);
tick(); // also check immediately on startup in case we started mid-minute
