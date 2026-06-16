#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/daily-learning.sh
# Runs at 8:57am via com.zazu.daily-learning launchd job.
# Reads curriculum state, delivers today's AI learning snippet via iMessage
# and sends the reference email directly via send-email.js (no draft).
# Updates curriculum.json after delivery.
#
# iMessage is sent via osascript (direct Messages.app) — NOT via Claude's
# iMessage MCP plugin, which is only available in the persistent daemon
# session and unreachable from one-shot launchd invocations.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

export PATH="/Users/zazunyche/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/zazunyche"

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LEARNING_DIR="$BOARD_DIR/learning"
LOG_DIR="$BOARD_DIR/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/daily-learning.log"

# ── Load shared notify library ────────────────────────────────────────────────
# shellcheck source=scripts/lib/zazu-notify.sh
source "$BOARD_DIR/scripts/lib/zazu-notify.sh"

# ── Load contact config (never committed — lives in ~/.zazu-config) ───────────
# shellcheck source=/dev/null
if ! source ~/.zazu-config 2>/dev/null; then
  log_ts "ERROR: ~/.zazu-config not found or not sourceable" "$LOG"
  # Can't alert via iMessage without config — just exit with failure
  exit 1
fi

log_ts "daily-learning.sh started" "$LOG"

# ── Guard: skip if already delivered today ────────────────────────────────────
TODAY=$(date "+%Y-%m-%d")
LAST_DELIVERED=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('$LEARNING_DIR/curriculum.json'));
  console.log(d.progress.last_delivered_date || '');
" 2>/dev/null || echo "")

if [ "$LAST_DELIVERED" = "$TODAY" ]; then
  log_ts "Already delivered today ($TODAY), skipping" "$LOG"
  exit 0
fi

# ── Read curriculum state ─────────────────────────────────────────────────────
SNIPPET_ID=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('$LEARNING_DIR/curriculum.json'));
  console.log(d.progress.current_snippet_id);
" 2>/dev/null) || {
  alert_failure "daily-learning.sh" "Failed to read current_snippet_id from curriculum.json" "$LOG"
  exit 1
}

DAY_NUM=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('$LEARNING_DIR/curriculum.json'));
  console.log(d.progress.current_day_number);
" 2>/dev/null) || {
  alert_failure "daily-learning.sh" "Failed to read current_day_number from curriculum.json" "$LOG"
  exit 1
}

MINI_MODULE=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('$LEARNING_DIR/curriculum.json'));
  console.log(d.progress.current_mini_module);
" 2>/dev/null) || {
  alert_failure "daily-learning.sh" "Failed to read current_mini_module from curriculum.json" "$LOG"
  exit 1
}

log_ts "Delivering $SNIPPET_ID (Day $DAY_NUM)" "$LOG"

# ── Determine snippet source ──────────────────────────────────────────────────
IMESSAGE_FILE="$LEARNING_DIR/snippets/${SNIPPET_ID}-imessage.md"
EMAIL_FILE="$LEARNING_DIR/snippets/${SNIPPET_ID}-email.md"

if [ -f "$IMESSAGE_FILE" ] && [ -f "$EMAIL_FILE" ]; then
  SNIPPET_SOURCE="pre-written"
else
  SNIPPET_SOURCE="generated"
fi

log_ts "Snippet source: $SNIPPET_SOURCE" "$LOG"

# ── GENERATE content if not pre-written ──────────────────────────────────────
# Claude's only job here is to create the snippet files + send the email.
# iMessage delivery and curriculum update are handled by the shell below.
if [ "$SNIPPET_SOURCE" = "generated" ]; then
  CURRICULUM_PLAN=$(cat "$LEARNING_DIR/curriculum-plan.md")
  CURRICULUM_STATE=$(cat "$LEARNING_DIR/curriculum.json")

  GENERATE_PROMPT="You are Zazu, the Nyche family AI house manager. TODAY: $TODAY.

Task: generate and save today's AI learning snippet for Dad.

SNIPPET: $SNIPPET_ID (Day $DAY_NUM of 50, Mini-Module $MINI_MODULE)

== CURRICULUM PLAN ==
$CURRICULUM_PLAN

== CURRICULUM STATE ==
$CURRICULUM_STATE

INSTRUCTIONS:
1. Write today's iMessage snippet (max 200 words, B then A format: concept+example, then analogy, then one-line teaser for tomorrow). Save to:
   $LEARNING_DIR/snippets/${SNIPPET_ID}-imessage.md

2. Write the reference email (1,200+ words, structured, ASCII diagrams where helpful). Save to:
   $LEARNING_DIR/snippets/${SNIPPET_ID}-email.md

3. Send the email:
   node $BOARD_DIR/scripts/send-email.js \\
     --to $DAD_EMAIL_WORK \\
     --subject '[subject from email file first line, strip leading #]' \\
     --body '[full email body]'

Do NOT send iMessage — the shell script handles that after you finish.
Do NOT update curriculum.json — the shell script handles that too.
Just generate the files and send the email."

  if ! /opt/homebrew/bin/claude \
    --dangerously-skip-permissions \
    -p "$GENERATE_PROMPT" \
    >> "$LOG" 2>&1; then
    alert_failure "daily-learning.sh" "Claude generation step exited non-zero for $SNIPPET_ID" "$LOG"
    exit 1
  fi

  log_ts "Claude generation complete" "$LOG"
fi

# ── Verify snippet files exist after generation ───────────────────────────────
if [ ! -f "$IMESSAGE_FILE" ]; then
  alert_failure "daily-learning.sh" "iMessage snippet file missing after generation: $IMESSAGE_FILE" "$LOG"
  exit 1
fi

if [ ! -f "$EMAIL_FILE" ]; then
  alert_failure "daily-learning.sh" "Email file missing: $EMAIL_FILE" "$LOG"
  exit 1
fi

# ── Send email for pre-written snippets (generated case sends during Claude run) ─
if [ "$SNIPPET_SOURCE" = "pre-written" ]; then
  EMAIL_SUBJECT=$(head -1 "$EMAIL_FILE" | sed 's/^# //')
  EMAIL_CONTENT=$(cat "$EMAIL_FILE")
  EMAIL_RESULT=$(node "$BOARD_DIR/scripts/send-email.js" \
    --to "$DAD_EMAIL_WORK" \
    --subject "$EMAIL_SUBJECT" \
    --body "$EMAIL_CONTENT" 2>&1)
  EMAIL_EXIT=$?
  log_ts "Email send result (exit $EMAIL_EXIT): $EMAIL_RESULT" "$LOG"
  if [ $EMAIL_EXIT -ne 0 ] || [[ "$EMAIL_RESULT" != *"SENT:"* ]]; then
    # Email failure is non-fatal — alert but continue with iMessage delivery
    alert_failure "daily-learning.sh" "Email send failed (exit $EMAIL_EXIT): $EMAIL_RESULT" "$LOG"
    log_ts "Continuing with iMessage delivery despite email failure" "$LOG"
  fi
fi

# ── Send iMessage via osascript (no MCP plugin needed) ───────────────────────
# Write content to a temp file to handle special characters safely.
IMESSAGE_RESULT=$(send_imessage "$DAD_NUMBER" "$(cat "$IMESSAGE_FILE")")
log_ts "iMessage send result: $IMESSAGE_RESULT" "$LOG"

# Validate delivery — check_imessage_result calls alert_failure automatically if bad
if ! check_imessage_result "$IMESSAGE_RESULT" "learning snippet Day $DAY_NUM to Dad" "$LOG"; then
  exit 1
fi

log_ts "iMessage delivered successfully for $SNIPPET_ID" "$LOG"

# ── Update curriculum.json (shell handles this — no Claude needed) ────────────
NEXT_DAY=$((DAY_NUM + 1))
NEXT_SNIPPET_ID="module1-day${NEXT_DAY}"

CURRICULUM_UPDATE_RESULT=$(node -e "
const fs = require('fs');
const path = '$LEARNING_DIR/curriculum.json';
const d = JSON.parse(fs.readFileSync(path));

// Mark current snippet delivered
let found = false;
for (const mod of d.modules) {
  for (const mm of mod.mini_modules) {
    for (const s of mm.snippets) {
      if (s.snippet_id === '$SNIPPET_ID') {
        s.delivery_status = 'delivered';
        s.delivered_at = new Date().toISOString();
        s.imessage_file = 'snippets/${SNIPPET_ID}-imessage.md';
        s.email_file = 'snippets/${SNIPPET_ID}-email.md';
        found = true;
        break;
      }
    }
    if (found) break;
  }
  if (found) break;
}

// Advance progress to next sequential day
d.progress.last_delivered_date = '$TODAY';
d.progress.status = 'in_progress';
d.progress.current_day_number = $NEXT_DAY;
d.progress.current_snippet_id = '$NEXT_SNIPPET_ID';
if (d.engagement_summary) {
  d.engagement_summary.total_snippets_delivered = (d.engagement_summary.total_snippets_delivered || 0) + 1;
}

// Write atomically
const tmp = path + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
fs.renameSync(tmp, path);
console.log('updated:day=$NEXT_DAY');
" 2>&1)
CURRICULUM_EXIT=$?

log_ts "Curriculum update (exit $CURRICULUM_EXIT): $CURRICULUM_UPDATE_RESULT" "$LOG"

if [ $CURRICULUM_EXIT -ne 0 ] || [[ "$CURRICULUM_UPDATE_RESULT" != *"updated:"* ]]; then
  alert_failure "daily-learning.sh" "curriculum.json update failed (exit $CURRICULUM_EXIT): $CURRICULUM_UPDATE_RESULT" "$LOG"
  exit 1
fi

log_ts "daily-learning.sh complete — delivered $SNIPPET_ID, advanced to Day $NEXT_DAY" "$LOG"
