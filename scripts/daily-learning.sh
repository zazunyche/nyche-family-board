#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/daily-learning.sh
# Runs at 8:57am via com.zazu.daily-learning launchd job.
# Reads curriculum state, delivers today's AI learning snippet via iMessage
# and sends the reference email directly via send-email.js (no draft).
# Updates curriculum.json after delivery.
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

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] daily-learning.sh started" >> "$LOG_DIR/daily-learning.log"

# ── Guard: skip if already delivered today ────────────────────────────────────
TODAY=$(date "+%Y-%m-%d")
LAST_DELIVERED=$(node -e "
  const d=JSON.parse(require('fs').readFileSync('$LEARNING_DIR/curriculum.json'));
  console.log(d.progress.last_delivered_date || '');
" 2>/dev/null || echo "")

if [ "$LAST_DELIVERED" = "$TODAY" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Already delivered today ($TODAY), skipping" >> "$LOG_DIR/daily-learning.log"
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

# ── Load snippet content (pre-written or generate from plan) ─────────────────
IMESSAGE_FILE="$LEARNING_DIR/snippets/${SNIPPET_ID}-imessage.md"
EMAIL_FILE="$LEARNING_DIR/snippets/${SNIPPET_ID}-email.md"

if [ -f "$IMESSAGE_FILE" ] && [ -f "$EMAIL_FILE" ]; then
  IMESSAGE_CONTENT=$(cat "$IMESSAGE_FILE")
  EMAIL_CONTENT=$(cat "$EMAIL_FILE")
  SNIPPET_SOURCE="pre-written"
else
  # Snippet not pre-written — read curriculum plan and generate on the fly
  CURRICULUM_PLAN=$(cat "$LEARNING_DIR/curriculum-plan.md")
  SNIPPET_SOURCE="generated"
  IMESSAGE_CONTENT="[GENERATE FROM PLAN]"
  EMAIL_CONTENT="[GENERATE FROM PLAN]"
fi

CURRICULUM_STATE=$(cat "$LEARNING_DIR/curriculum.json")

# ── Send email directly (no Claude needed for this step) ─────────────────────
if [ "$SNIPPET_SOURCE" = "pre-written" ]; then
  EMAIL_SUBJECT=$(head -1 "$EMAIL_FILE" | sed 's/^# //')
  EMAIL_SEND_RESULT=$(node "$BOARD_DIR/scripts/send-email.js" \
    --to "$DAD_EMAIL_WORK" \
    --subject "$EMAIL_SUBJECT" \
    --body "$EMAIL_CONTENT" 2>&1)
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Email: $EMAIL_SEND_RESULT" >> "$LOG_DIR/daily-learning.log"
fi

# ── Build prompt ──────────────────────────────────────────────────────────────
PROMPT="You are Zazu, the Nyche family AI house manager. It is 9am — time to deliver today's AI learning snippet to Dad.

TODAY: $TODAY
SNIPPET: $SNIPPET_ID (Day $DAY_NUM of 50, Mini-Module $MINI_MODULE)
SOURCE: $SNIPPET_SOURCE

$(if [ "$SNIPPET_SOURCE" = "pre-written" ]; then
echo "== IMESSAGE SNIPPET (send this exactly) ==
$IMESSAGE_CONTENT

NOTE: The reference email has already been sent directly to $DAD_EMAIL_WORK
by the shell script. Do NOT create any Gmail draft."
else
echo "== CURRICULUM PLAN (use this to generate today's snippet) ==
$CURRICULUM_PLAN

== CURRICULUM STATE ==
$CURRICULUM_STATE

Generate today's iMessage snippet and email content following the established format:
- iMessage: concept + example (B) then analogy (A), application-first, max 200 words, self-contained
- Email: 1,200+ words, structured reference with ASCII diagrams where helpful, built to return to
- Save the generated files to:
  $LEARNING_DIR/snippets/${SNIPPET_ID}-imessage.md
  $LEARNING_DIR/snippets/${SNIPPET_ID}-email.md
- Then send the email using: node $BOARD_DIR/scripts/send-email.js --to $DAD_EMAIL_WORK --subject 'SUBJECT' --body 'BODY'"
fi)

DELIVERY INSTRUCTIONS:
1. Send the iMessage snippet to Dad via iMessage (ONLY task for pre-written snippets)
2. After sending, update curriculum.json:
   - Set progress.last_delivered_date to '$TODAY'
   - Set progress.status to 'in_progress'
   - Find the snippet entry with id '$SNIPPET_ID' and set delivered=true, delivery_date='$TODAY'
   - Advance progress.current_day_number to $((DAY_NUM + 1)) and update current_snippet_id accordingly
   Use node to write the JSON: node -e \"const fs=require('fs'); const d=JSON.parse(fs.readFileSync('$LEARNING_DIR/curriculum.json')); /* make changes */ fs.writeFileSync('$LEARNING_DIR/curriculum.json', JSON.stringify(d, null, 2));\"

CRITICAL — iMessage delivery:
- Use ONLY the mcp__plugin_imessage_imessage__reply tool
- Dad chat_id: any;-;$DAD_NUMBER
- Do NOT use osascript, bash, or Messages.app"

# ── Invoke Claude ─────────────────────────────────────────────────────────────
# Wait 8s for the iMessage plugin MCP handshake to complete before Claude
# tries to call the tool. Without this, the plugin connects too late and
# the reply tool is missing from Claude's tool list in one-shot (-p) mode.
sleep 8

/opt/homebrew/bin/claude \
  --channels plugin:imessage@claude-plugins-official \
  --system-prompt ~/.claude/system-prompt.md \
  --dangerously-skip-permissions \
  -p "$PROMPT" \
  >> "$LOG_DIR/daily-learning.log" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] daily-learning.sh complete" >> "$LOG_DIR/daily-learning.log"
