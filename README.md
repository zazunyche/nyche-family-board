# 🏠 Nyche Family Board

**Managed by Zazu. Viewed by the family.**

---

## What this is

A persistent household task board for the Nyche family, running on the Mac Mini alongside Zazu. Zazu reads and writes `board-data.json` using the board tools, receives tasks from iMessage/Gmail/Calendar, and delivers briefings and reminders through her existing iMessage channel.

The board solves Zazu's core limitation: **state was previously conversational**, lost between sessions. Now it's external, structured, and always available.

---

## Architecture

```
board-data.json          ← Source of truth (all household tasks, reminders, vehicles)
     ↑ ↓
board-tools/*.js         ← Zazu's read/write scripts (called from claude -p prompts)
     ↑ ↓
scripts/*.sh             ← launchd one-shots (follow daily-briefing.sh pattern exactly)
     ↑
launchd plists           ← Scheduling (never cron — launchd only)
     ↑
Zazu iMessage channel    ← All iMessages go through mcp__plugin_imessage__* tools
```

**Key principle:** Board scripts never send iMessages directly. They output text or update `board-data.json`. Zazu's channel session handles all delivery.

---

## File layout

```
family-board/
├── board-data.json              ← SOURCE OF TRUTH
├── server.js                    ← Local web server (port 3000)
├── package.json
│
├── board-tools/                 ← Zazu's read/write scripts
│   ├── zazu-context.js          ← MAIN: outputs context block for claude -p prompts
│   ├── read.js                  ← Human-readable board state
│   ├── add.js                   ← Add a new task
│   ├── update.js                ← Update any task field
│   ├── move.js                  ← Move task to new stage
│   └── mark-reminded.js         ← Mark a pending reminder as sent
│
├── scripts/                     ← Shell scripts called by launchd
│   ├── board-briefing.sh        ← 7:00am: board-context → claude -p → iMessage
│   ├── board-reminders.sh       ← 8:00am: pending reminders → claude -p → iMessage
│   ├── gmail-scan.sh            ← Every 2h: Gmail scan → tasks + calendar + reminders
│   ├── midnight-commit.sh       ← 12:00am: git commit board-data.json
│   ├── generate-snapshot.js     ← On-demand HTML snapshot
│   ├── setup.sh                 ← One-time install
│   └── patch-system-prompt.md  ← What to add to ~/.claude/system-prompt.md
│
├── launchd/                     ← Plist files (copy to ~/Library/LaunchAgents/)
│   ├── com.zazu.board-briefing.plist
│   ├── com.zazu.gmail-scan.plist
│   ├── com.zazu.board-reminders.plist
│   └── com.zazu.board-midnight-commit.plist
│
└── public/
    └── index.html               ← Visual Kanban board UI
```

---

## Installation

```bash
bash ~/family-board/scripts/setup.sh
```

Then add the board integration block to `~/.claude/system-prompt.md`:
```bash
cat ~/family-board/scripts/patch-system-prompt.md
# Copy the block under "Patching Zazu's system-prompt.md" and append it
```

---

## Scheduled jobs (launchd)

| Time | Job | Script |
|---|---|---|
| 7:00am daily | `com.zazu.board-briefing` | `board-briefing.sh` |
| 8:00am daily | `com.zazu.board-reminders` | `board-reminders.sh` |
| Every 2h, 7:30am–9pm | `com.zazu.gmail-scan` | `gmail-scan.sh` |
| 12:00am daily | `com.zazu.board-midnight-commit` | `midnight-commit.sh` |

All jobs follow the `com.zazu.daily-briefing` pattern: shell script → `claude -p` with context embedded.

**To test a job immediately:**
```bash
launchctl start com.zazu.board-briefing
tail -f /tmp/zazu-board-briefing.stdout.log
```

**To add a new recurring behavior:** follow the launchd pattern in `launchd/` — never use crontab.

---

## Zazu's board tools (quick reference)

```bash
# What's on the board right now (for embedding in prompts)
node board-tools/zazu-context.js

# Brief version (urgent + stalled only)
node board-tools/zazu-context.js --brief

# Human-readable text
node board-tools/read.js --text

# Add a task (prints new task ID)
node board-tools/add.js \
  --title "Call HVAC company" \
  --category HOME --owner DAD --priority HIGH \
  --stage ACTIVE --due 2025-06-10 \
  --notes "Carrier unit making noise" \
  --source imessage --actor ZAZU

# Move a task
node board-tools/move.js --task t_001 --to done --actor DAD

# Update a task
node board-tools/update.js --task t_001 --owner MOM --actor ZAZU
node board-tools/update.js --task t_002 --snooze 2025-07-01 --actor DAD
node board-tools/update.js --task t_002 --zazuNotes "3 quotes obtained..." --actor ZAZU

# Mark a reminder delivered
node board-tools/mark-reminded.js --reminder rem_abc123

# Generate HTML snapshot
node scripts/generate-snapshot.js --open
```

---

## iMessage handle format

Phone numbers work — this matches Zazu's allowlist in `~/.claude/channels/imessage/access.json`.

- Dad: `+16173353840`
- Mom: `+16175438839`

---

## board-data.json structure

```
meta          — version, lastUpdated, lastUpdatedBy, timezone
settings      — staleThresholdDays, owners (with iMessage handles), calendar config
tasks[]       — all task objects
vehicles[]    — vehicle records with registration/insurance dates
vendors{}     — contractor log
goals[]       — household goals linked to task IDs
pendingReminders[] — scheduled iMessage reminders (created by gmail-scan, sent by board-reminders)
```

### Task object fields
```
id             — unique (t_xxxxx)
title          — task name
notes          — human context
zazuNotes      — Zazu's research (separate from human notes)
category       — HOME|VEHICLES|FAMILY|ADMIN|YARD|GOALS
stage          — IDEA|RESEARCH|ACTIVE|ASSIGNED|DONE
priority       — HIGH|MEDIUM|LOW
owner          — DAD|MOM|BOTH|ZAZU
dueDate        — YYYY-MM-DD or null
snoozedUntil   — date; Zazu skips until this date
recurrence     — yearly|quarterly|monthly|null
source         — manual|imessage|calendar|email
briefCount     — how many times surfaced (Zazu uses to avoid nagging)
lastBriefed    — ISO timestamp of last briefing mention
history[]      — append-only audit log: { timestamp, actor, change }
```

---

## Viewing the board

**On home network:**
```
http://macmini.local:3000
```

**Anywhere (Phase 3 — GitHub Pages):**
See Phase 3 section below.

---

## Email integration: the Spirit Day flow

1. Daycare emails: *"Thursday Sept 12 is Spirit Day — wear ORANGE"*
2. Dad or Mom forwards it to their Gmail account
3. `com.zazu.gmail-scan` fires within 2 hours
4. Zazu reads the email via `mcp__claude_ai_Gmail__*`
5. Claude parses it: date Sept 12, action "wear orange", category FAMILY
6. Board task created: "AJ wear orange — Spirit Day at daycare" [FAMILY, BOTH]
7. Calendar event created on Sept 12 (via osascript or Google Calendar MCP)
8. Reminder entries added to `pendingReminders[]`:
   - Sept 10: "📅 In 2 days: AJ wears orange — Spirit Day Thursday! — Zazu"
   - Sept 12: "🌅 Today: Don't forget — AJ needs to wear orange for Spirit Day! 🧡 — Zazu"
9. Confirmation iMessage sent: "✓ Got it — board task created + calendar event + reminders set — Zazu"

---

## Phase 3: GitHub Pages (when ready)

1. Create GitHub repo, add remote, push
2. Enable GitHub Pages on `main` branch
3. Add JS password gate to `public/index.html`
4. Update `midnight-commit.sh` to also `git push`
5. Board UI reads from raw GitHub URL instead of `/api/board`

---

*Nyche Family Board v2.0 · Built with Claude · Managed by Zazu*
