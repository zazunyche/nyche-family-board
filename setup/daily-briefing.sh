#!/bin/bash
# Zazu daily morning briefing — runs at 7am via launchd (com.zazu.daily-briefing)
# Claude composes and sends the iMessage; osascript pulls today's calendar events.

export PATH="/Users/zazunyche/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/Users/zazunyche"

# ── Load contact config (never committed — lives in ~/.zazu-config) ───────────
# shellcheck source=/dev/null
source ~/.zazu-config

TODAY=$(date '+%A, %B %-d, %Y')
DOW=$(date '+%A')   # e.g. "Wednesday"

# Pull today's events from Family, Home, and Work calendars
# Timeout after 20s so a hung Calendar app doesn't block the briefing
EVENTS=$(timeout 20 osascript << 'OSASCRIPT' 2>/dev/null
tell application "Calendar"
  set todayDate to current date
  set startOfDay to todayDate
  set hours of startOfDay to 0
  set minutes of startOfDay to 0
  set seconds of startOfDay to 0
  set endOfDay to startOfDay + (23 * hours + 59 * minutes + 59)

  set allCals to {"Family", "Home", "Work"}
  set eventSummary to ""

  repeat with calName in allCals
    try
      set theCal to calendar calName
      set todayEvents to (every event of theCal whose start date >= startOfDay and start date <= endOfDay)
      repeat with e in todayEvents
        set eventSummary to eventSummary & "[" & calName & "] " & summary of e & " at " & (time string of (start date of e)) & "\n"
      end repeat
    end try
  end repeat

  if eventSummary is "" then
    return "No events scheduled today."
  else
    return eventSummary
  end if
end tell
OSASCRIPT
) || EVENTS="(Calendar unavailable — check the app)"

PROMPT="You are Zazu, the house manager for the Nyche family. It is 7:00am on ${TODAY} (${DOW}).

Today's calendar events (Family, Home, Work):
${EVENTS}

Send the morning daily briefing to Dad via iMessage (chat_id: any;-;<DAD_NUMBER>). Keep it warm, concise, and useful. Include:
- A brief good morning with today's date and day
- Today's scheduled events (if any)
- Any day-specific standing reminders (e.g. on Wednesdays: Child_1 needs swim wear)
- Anything else relevant based on context

CRITICAL — iMessage delivery:
- Use ONLY the mcp__plugin_imessage_imessage__reply tool to send
- Dad chat_id: any;-;<DAD_NUMBER>
- Do NOT use osascript, bash, or Messages.app directly

Send it now."

/opt/homebrew/bin/claude \
  --channels plugin:imessage@claude-plugins-official \
  --dangerously-skip-permissions \
  --system-prompt /Users/zazunyche/.claude/system-prompt.md \
  -p "$PROMPT"
