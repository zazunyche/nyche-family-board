#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/gmail-scan.sh
# Called by com.zazu.gmail-scan launchd job every 2 hours, 7am–9pm.
# Uses Zazu's existing mcp__claude_ai_Gmail__* MCP tools — no OAuth needed.
#
# Instructs Claude (as Zazu) to:
#   1. Scan unread Gmail from the last 2 hours
#   2. Identify household-relevant emails (direct OR forwarded)
#   3. Create board tasks via board-tools/add.js for anything actionable
#   4. Create Apple Calendar events via osascript or Google Calendar MCP
#      for any date-specific items (spirit day, school events, appointments)
#   5. Schedule iMessage reminders in board-data.json → pendingReminders[]
#   6. Send iMessage confirmation to whoever forwarded/sent the email
#   7. Label processed emails in Gmail so they aren't re-processed
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BOARD_DIR="/Users/zazunyche/Documents/src/family-board"
LOG_DIR="$BOARD_DIR/logs"
PROCESSED_FILE="$LOG_DIR/gmail-processed-ids.txt"
mkdir -p "$LOG_DIR"
touch "$PROCESSED_FILE"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] gmail-scan.sh started" >> "$LOG_DIR/gmail-scan.log"

# ── Get board context (brief mode — just urgent/stalled) ──────────────────────
BOARD_CONTEXT=$(node "$BOARD_DIR/board-tools/zazu-context.js" --brief 2>>"$LOG_DIR/gmail-scan.log") || {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: zazu-context.js failed" >> "$LOG_DIR/gmail-scan.log"
  exit 1
}

# ── Load contact config (never committed — lives in ~/.zazu-config) ───────────
# shellcheck source=/dev/null
source ~/.zazu-config

TODAY=$(date "+%Y-%m-%d")

PROMPT="You are Zazu, the Nyche family's AI house manager. Today is $TODAY.

Your task: scan the Nyche family Gmail inbox for household-relevant emails received in the last 2-3 hours, then take the appropriate actions.

FAMILY CONTEXT:
- Dad: $DAD_NUMBER
- Mom: $MOM_NUMBER
- Child_1/HRH: 21-month-old son
- Based in Atlanta, GA
- Both parents work from home in tech

CURRENT BOARD STATE (brief):
$BOARD_CONTEXT

STEP 1 — SCAN GMAIL
Use your Gmail MCP tools to search for recent unread emails. Look for:
- Emails from daycare, school, or childcare providers
- Forwarded emails (subject starts with Fwd: or FW:)
- HOA notices, utility bills, contractor emails
- Medical appointment confirmations or reminders
- Any email requiring a household action or awareness

Search query: 'is:unread -label:zazu-processed newer_than:3h'

STEP 2 — FOR EACH RELEVANT EMAIL, DECIDE:
Is this actionable for the household? If yes:

A) Does it have a specific DATE and require showing up / doing something?
   Example: 'Thursday is Spirit Day — wear orange'
   → Create a board task AND a calendar event AND schedule reminders

B) Is it a task without a hard date?
   Example: 'Your HVAC service is due' or 'HOA dues invoice enclosed'
   → Create a board task only

C) Is it purely informational (newsletter, receipt for something already done)?
   → Skip — do not create a task

STEP 3 — CREATE BOARD TASKS
For actionable emails, run this command:
  node $BOARD_DIR/board-tools/add.js \\
    --title \"[clear action title]\" \\
    --category [HOME|VEHICLES|FAMILY|ADMIN|YARD|GOALS] \\
    --owner [DAD|MOM|BOTH] \\
    --priority [HIGH|MEDIUM|LOW] \\
    --stage ACTIVE \\
    --due [YYYY-MM-DD or omit] \\
    --notes \"[context from email — sender, key details]\" \\
    --source email \\
    --actor ZAZU

STEP 4 — CREATE CALENDAR EVENTS (for date-specific items)
For events with a specific date (spirit day, picture day, appointment, school event):
Use your Google Calendar MCP or osascript to create an event on the relevant date.
Include in the event description: what needs to happen, who needs to do what.

STEP 5 — SCHEDULE REMINDERS
For date-specific events, add entries to board-data.json → pendingReminders[].
Format each reminder as a JSON object and append it to the pendingReminders array
by reading the file, adding the entry, and writing it back atomically (write to .tmp then rename).

Reminder structure:
{
  \"id\": \"rem_[random6chars]\",
  \"taskId\": \"[board task id]\",
  \"sendDate\": \"YYYY-MM-DD\",
  \"owner\": \"DAD\",
  \"handle\": \"$DAD_NUMBER\",
  \"message\": \"[warm, specific iMessage text]\",
  \"sent\": false,
  \"createdAt\": \"[ISO timestamp]\",
  \"sourceTask\": \"[task title]\"
}

Schedule reminders for BOTH Dad and Mom. For most events: 2 days before + day of.
For important events (medical, school): 7 days, 2 days, day of.

Day-of reminder example:
'🌅 Today: Don't forget — Child_1 needs to wear orange for Spirit Day at daycare! 🧡 — Zazu'

Pre-event reminder example:
'📅 In 2 days (Thursday): Spirit Day at daycare — Child_1 wears orange. Just a heads up! — Zazu'

STEP 6 — SEND CONFIRMATION iMESSAGE
After creating each task, send a brief confirmation to the parent who sent/forwarded the email.
Use mcp__plugin_imessage_imessage__* to send.
Example: '✓ Got it — added \"Child_1 wear orange — Spirit Day\" to the board and set a reminder for 2 days before and the morning of. — Zazu'

STEP 7 — LABEL PROCESSED EMAILS
Use Gmail MCP to add the label 'zazu-processed' to each email you handled.
This prevents re-processing on the next scan.

IMPORTANT RULES:
- Never create duplicate tasks — check the board context first
- Never process the same email twice — check the label before acting
- Keep task titles clear and actionable, not email-subject-style
- For forwarded emails, the action is usually for whoever forwarded it
- Daycare/school emails are almost always FAMILY category, owner BOTH
- Contractor/vendor emails are HOME or YARD, owner DAD unless specified
- Medical/health emails are FAMILY, owner MOM unless specified
- If unsure of owner, use BOTH
- Do not send briefing-style messages — only confirmation of what you just did"

# ── Invoke Claude (one-shot) ──────────────────────────────────────────────────
claude -p "$PROMPT" \
  --system-prompt ~/.claude/system-prompt.md \
  --dangerously-skip-permissions \
  >> "$LOG_DIR/gmail-scan.log" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] gmail-scan.sh complete" >> "$LOG_DIR/gmail-scan.log"
