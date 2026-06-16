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

# ── Load contact config (never committed — lives in ~/.zazu-config) ───────────
# shellcheck source=/dev/null
source ~/.zazu-config

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LEARNING_DIR="$BOARD_DIR/learning"
LOG_DIR="$BOARD_DIR/logs"
mkdir -p "$LOG_DIR"

LOG="$LOG_DIR/daily-learning.log"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] daily-learning.sh started" >> "$LOG"

# ── Guard: skip if already delivered today ────────────────────────────────────
TODAY=$(date "+%Y-%m-%d")
LAST_DELIVERED=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('$LEARNING_DIR/curriculum.json'));
  console.log(d.progress.last_delivered_date || '');
" 2>/dev/null || echo "")

if [ "$LAST_DELIVERED" = "$TODAY" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Already delivered today ($TODAY), skipping" >> "$LOG"
  exit 0
fi

# ── Read curriculum state ─────────────────────────────────────────────────────
SNIPPET_ID=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('$LEARNING_DIR/curriculum.json'));
  console.log(d.progress.current_snippet_id);
" 2>/dev/null)

DAY_NUM=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('$LEARNING_DIR/curriculum.json'));
  console.log(d.progress.current_day_number);
" 2>/dev/null)

MINI_MODULE=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('$LEARNING_DIR/curriculum.json'));
  console.log(d.progress.current_mini_module);
" 2>/dev/null)

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Delivering $SNIPPET_ID (Day $DAY_NUM)" >> "$LOG"

# ── Determine snippet source ──────────────────────────────────────────────────
IMESSAGE_FILE="$LEARNING_DIR/snippets/${SNIPPET_ID}-imessage.md"
EMAIL_FILE="$LEARNING_DIR/snippets/${SNIPPET_ID}-email.md"

if [ -f "$IMESSAGE_FILE" ] && [ -f "$EMAIL_FILE" ]; then
  SNIPPET_SOURCE="pre-written"
else
  SNIPPET_SOURCE="generated"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Snippet source: $SNIPPET_SOURCE" >> "$LOG"

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

  /opt/homebrew/bin/claude \
    --dangerously-skip-permissions \
    -p "$GENERATE_PROMPT" \
    >> "$LOG" 2>&1

  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Claude generation complete" >> "$LOG"
fi

# ── Verify snippet files exist after generation ───────────────────────────────
if [ ! -f "$IMESSAGE_FILE" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: iMessage file missing after generation: $IMESSAGE_FILE" >> "$LOG"
  exit 1
fi

if [ ! -f "$EMAIL_FILE" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: Email file missing: $EMAIL_FILE" >> "$LOG"
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
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Email: $EMAIL_RESULT" >> "$LOG"
fi

# ── Send iMessage via osascript (no MCP plugin needed) ───────────────────────
# Write content to a temp file to handle special characters safely.
TEMP_MSG=$(mktemp /tmp/zazu-learning-XXXXXX.txt)
cat "$IMESSAGE_FILE" > "$TEMP_MSG"

IMESSAGE_RESULT=$(osascript << OSASCRIPT 2>&1
set msgFile to "$TEMP_MSG"
set fileHandle to open for access POSIX file msgFile
set msgText to (read fileHandle)
close access fileHandle

tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy "$DAD_NUMBER" of targetService
  send msgText to targetBuddy
end tell
return "sent"
OSASCRIPT
)

rm -f "$TEMP_MSG"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] iMessage: $IMESSAGE_RESULT" >> "$LOG"

# ── Update curriculum.json (shell handles this — no Claude needed) ────────────
NEXT_DAY=$((DAY_NUM + 1))
NEXT_SNIPPET_ID="module1-day${NEXT_DAY}"

node -e "
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

fs.writeFileSync(path, JSON.stringify(d, null, 2));
console.log('curriculum.json updated: advanced to day $NEXT_DAY ($NEXT_SNIPPET_ID)');
" >> "$LOG" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] daily-learning.sh complete" >> "$LOG"
