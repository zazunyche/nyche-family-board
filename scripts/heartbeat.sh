#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/heartbeat.sh
#
# Fires every 4.5 hours via zazu-scheduler.js (00:00 / 04:30 / 09:00 /
# 13:30 / 18:00 / 22:30).
#
# Purpose:
#   1. If a prior Claude or Yaa session was interrupted mid-task (token limit,
#      crash, etc.), detect the leftover WIP state file and resume the work.
#   2. If no WIP, scan the board for ZAZU-owned or queued backlog items and
#      start the highest-priority one.
#   3. Text Dad a summary of what was done — only during daytime (08:00–22:00)
#      so night runs are silent.
#
# WIP state contract:
#   Any long-running session (Zazu, Yaa, etc.) SHOULD write ~/.zazu-wip.json
#   before it might be cut off, with at minimum:
#     { "task": "<description>", "nextStep": "<what to do next>",
#       "boardTaskId": "<optional>", "startedAt": "<ISO8601>",
#       "agent": "ZAZU|YAA|OTHER" }
#   On successful completion, delete ~/.zazu-wip.json.
#   The heartbeat handles the rest.
#
# MCP note: iMessage MCP plugin is unreliable in headless claude -p sessions
#   (connection may not finish registering). The claude work session below
#   uses built-in tools only (Read, Write, Edit, Bash). iMessage delivery
#   at the end is done directly via osascript — the proven path.
# ─────────────────────────────────────────────────────────────────────────────

export PATH="/Users/zazunyche/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/zazunyche"

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG="$BOARD_DIR/logs/heartbeat.log"
WIP_FILE="$HOME/.zazu-wip.json"
BOARD_FILE="$BOARD_DIR/board-data.json"

source "$BOARD_DIR/scripts/lib/zazu-notify.sh"
if ! source ~/.zazu-config 2>/dev/null; then
  log_ts "ERROR: ~/.zazu-config not found" "$LOG"
  exit 1
fi

log_ts "heartbeat.sh started" "$LOG"

# ── Daytime check (08:00–22:00 ET) ──────────────────────────────────────────
HOUR=$(date +%H)
DAYTIME=false
if [ "$HOUR" -ge 8 ] && [ "$HOUR" -lt 22 ]; then
  DAYTIME=true
fi

# ── Build board snapshot (non-DONE tasks) ───────────────────────────────────
BOARD_SNAPSHOT=$(python3 - "$BOARD_FILE" << 'PYEOF' 2>/dev/null
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
active = [t for t in d.get("tasks", []) if t.get("stage") not in ("DONE",)]
print(json.dumps(active, indent=2))
PYEOF
) || BOARD_SNAPSHOT="[]"

# ── WIP state ────────────────────────────────────────────────────────────────
WIP_CONTEXT="NONE"
WIP_AGE_MINS=0
if [ -f "$WIP_FILE" ]; then
  WIP_CONTEXT=$(cat "$WIP_FILE")
  # Age in minutes (using file modification time)
  WIP_AGE_MINS=$(( ( $(date +%s) - $(stat -f %m "$WIP_FILE") ) / 60 ))
  log_ts "WIP file found (age: ${WIP_AGE_MINS}min): $WIP_CONTEXT" "$LOG"
fi

# ── Build prompt ─────────────────────────────────────────────────────────────
NOW=$(date '+%Y-%m-%d %H:%M ET')

PROMPT="You are Zazu, the Nyche family house manager AI running on a Mac mini at /Users/zazunyche. This is an automated heartbeat check — it fires every 4.5 hours to ensure no work falls through the cracks.

Current time: $NOW

=== YOUR JOB THIS SESSION ===

1. CHECK WIP STATE FIRST. If there is an active work-in-progress file below (not NONE), continue that task. The WIP file age is ${WIP_AGE_MINS} minutes — if it is older than 60 minutes it likely means a prior session was interrupted.

2. IF NO WIP (or WIP is fresh/< 5 min old, meaning the prior session just started and is probably still running): scan the board backlog below for the highest-priority ZAZU-owned or queued work item and begin it.

3. WHEN STARTING LONG WORK: before beginning anything that might take more than a few minutes of tool use, write your intended work to $WIP_FILE so the next heartbeat can resume if you get cut off:
   Example: echo '{\"task\": \"Implement stageHistory schema\", \"nextStep\": \"Update board-data.json task schema, then update board-reminders.sh to write stageHistory on transitions\", \"boardTaskId\": \"t_XXX\", \"startedAt\": \"${NOW}\", \"agent\": \"ZAZU\"}' > $WIP_FILE

4. WHEN COMPLETE: delete the WIP file: rm -f $WIP_FILE
   Then write a brief summary (2-4 lines) of what you did to: $LOG
   Format: [DONE] <task name> — <what was accomplished>

5. LOG YOUR WORK. Append to $LOG throughout. Every significant action should be logged.

=== IMPORTANT CONSTRAINTS ===
- Do NOT use iMessage MCP tools — they may not be available in this session
- Do NOT use Gmail MCP, Notion MCP, or Google Calendar MCP tools — same reason
- You CAN use Bash, Read, Write, Edit tools — these always work
- You CAN send iMessages via Bash: osascript -e 'tell app \"Messages\" to send \"msg\" to buddy \"+1XXX\" of service 1'
- But only send iMessages if the work is genuinely complete and noteworthy
- Keep this session focused — pick ONE task and complete it. Do not start multiple things.
- If the work is larger than one session, write a clear WIP file and stop.
- File paths are absolute from /Users/zazunyche/

=== WIP STATE ===
${WIP_CONTEXT}

=== BOARD BACKLOG (non-DONE tasks) ===
${BOARD_SNAPSHOT}

=== KNOWN PENDING ZAZU WORK (from analytics plan v1.2) ===
Priority order based on Dad's Week 1+2 catch-up request (Jun 25):
1. stageHistory schema — add to board-data.json and write on every stage transition
2. taskType inference — add field to task schema, infer type from title/category/source
3. effortTag auto-inference — XS/S/M/L/XL, infer from title keywords
4. Dynamic priority escalation — nightly check: escalate tasks approaching deadline
5. board-health.js — script that checks board for stale tasks, missing fields, etc.
6. completion-rate.js — calculates completion rate, average time-to-done, etc.
7. resistanceScore writes — flag tasks briefed 3+ times with no stage movement
8. requirements[] array — seed with decisions captured in Jun conversations

Proceed. Do the work. Log it. Clean up WIP when done."

# ── Run the claude work session ───────────────────────────────────────────────
log_ts "Launching claude -p work session" "$LOG"

# Trap SIGTERM (sent by scheduler at timeout) and propagate to the claude
# subprocess so it doesn't become an orphan holding AppleEvent connections.
CLAUDE_PID=""
cleanup() {
  [ -n "$CLAUDE_PID" ] && kill "$CLAUDE_PID" 2>/dev/null
  log_ts "heartbeat.sh: received SIGTERM — killed claude subprocess (pid $CLAUDE_PID)" "$LOG"
  exit 1
}
trap cleanup SIGTERM SIGINT

/opt/homebrew/bin/claude -p "$PROMPT" --dangerously-skip-permissions >> "$LOG" 2>&1 &
CLAUDE_PID=$!
# Wait up to 8 minutes, then kill cleanly
( sleep 480; kill "$CLAUDE_PID" 2>/dev/null ) &
WATCHDOG_PID=$!
wait "$CLAUDE_PID"
WORK_EXIT=$?
kill "$WATCHDOG_PID" 2>/dev/null
trap - SIGTERM SIGINT

WORK_OUTPUT=""  # output is now in LOG directly
if [ $WORK_EXIT -ne 0 ]; then
  log_ts "heartbeat claude session failed — exit $WORK_EXIT" "$LOG"
fi

# ── Daytime summary iMessage ──────────────────────────────────────────────────
# Only text Dad if: (a) daytime, (b) session produced output, (c) WIP was
# cleared (meaning actual work finished) or board task was updated.
if [ "$DAYTIME" = true ] && [ ! -f "$WIP_FILE" ] && [ $WORK_EXIT -eq 0 ]; then
  SUMMARY_MSG="Heartbeat work session complete — ${NOW}. Check heartbeat.log for details. — Zazu"
  RESULT=$(send_imessage "$DAD_NUMBER" "$SUMMARY_MSG")
  check_imessage_result "$RESULT" "heartbeat summary to Dad" "$LOG"
fi

log_ts "heartbeat.sh complete" "$LOG"
