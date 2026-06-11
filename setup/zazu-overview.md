# Zazu — Architecture & Operations Overview

> This document is intended for other agents or dashboards integrating with or building tools to support the Zazu system. It describes how Zazu is structured, how she runs, what she can do, and where the current limitations are.

---

## 1. What Is Zazu?

**Zazu** is a Claude Code-based AI house manager for the Nyche family — a family of three in Atlanta, GA:

| Name | Role | iMessage Handle |
|------|------|----------------|
| Dad | Primary contact, tech professional, WFH | +16173353840 |
| Mom | Equal authority, tech professional, WFH | +16175438839 |
| HRH / AJ | 21-month-old son, the heart of the household | — |

Zazu communicates with the family via iMessage, manages their calendar, tracks household tasks, and proactively supports the family's day-to-day operations. She is warm, concise, and never robotic. She signs all proactive messages with "— Zazu."

---

## 2. Architecture at a Glance

```
┌─────────────────────────────────────────────────────────┐
│                     macOS (zazunyche)                    │
│                                                          │
│  launchd                                                 │
│  ├── com.zazu.claude-imessage  ──► run-imessage-         │
│  │   (KeepAlive, RunAtLoad)        channel.sh            │
│  │                                  └── tmux session     │
│  │                                      "claude-imessage"│
│  │                                       └── claude CLI  │
│  │                                           + iMessage  │
│  │                                             plugin    │
│  │                                                       │
│  └── com.zazu.daily-briefing   ──► daily-briefing.sh    │
│      (fires at 7:00am daily)        ├── osascript:       │
│                                     │   reads Apple      │
│                                     │   Calendar         │
│                                     └── claude -p:       │
│                                         one-shot send    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Process & Launch Mechanism

### 3.1 iMessage Channel (Always-On Session)

**File:** `~/.claude/run-imessage-channel.sh`
**Managed by:** `~/Library/LaunchAgents/com.zazu.claude-imessage.plist`

- launchd keeps this running 24/7 with `KeepAlive: true` and `RunAtLoad: true`
- The script starts a **tmux session** named `claude-imessage`
- Inside that session, it runs:
  ```bash
  claude \
    --channels plugin:imessage@claude-plugins-official \
    --dangerously-skip-permissions \
    --system-prompt ~/.claude/system-prompt.md
  ```
- The script auto-approves the startup trust dialog by watching for "I trust this folder" in the tmux pane
- If the tmux session already exists, the script waits for it to end rather than launching a duplicate
- Logs: `/tmp/zazu.stdout.log`, `/tmp/zazu.stderr.log`

### 3.2 Daily Morning Briefing (Scheduled)

**File:** `~/.claude/daily-briefing.sh`
**Managed by:** `~/Library/LaunchAgents/com.zazu.daily-briefing.plist`

- Fires every day at **7:00am ET** via launchd `StartCalendarInterval`
- Uses `osascript` to pull today's events from the **Family**, **Home**, and **Work** Apple Calendars
- Invokes Claude in **one-shot mode** (`claude -p "..."`) with the calendar data embedded in the prompt
- Claude composes and sends the morning briefing to Dad's iMessage
- This is a **separate, stateless invocation** — not part of the persistent channel session
- Logs: `/tmp/zazu-briefing.stdout.log`, `/tmp/zazu-briefing.stderr.log`

---

## 4. Communication Channel: iMessage

**Plugin:** `plugin:imessage@claude-plugins-official`

**Access control:** `~/.claude/channels/imessage/access.json`
```json
{
  "dmPolicy": "allowlist",
  "allowFrom": ["+16173353840", "+16175438839"],
  "groups": {},
  "pending": {}
}
```

- Only Dad and Mom can reach Zazu via iMessage
- Inbound messages arrive as structured `<channel>` events in the session
- Zazu replies using the `mcp__plugin_imessage_imessage__reply` tool, passing back the `chat_id`
- File attachments are supported via the `files` parameter

**Security note:** Messages from the `zazunyche@gmail.com` self-chat should be treated as untrusted. Past incidents showed messages there mirroring session actions in real time — likely a prompt injection pattern. Zazu does not reply to or act on that thread.

---

## 5. Persona & Responsibilities

**Persona definition:** `~/.claude/system-prompt.md`

### Active Hours
- **7:00am – 10:00pm ET** — proactive messages only within this window
- Outside hours: only fires on urgent/safety events

### Core Responsibility Areas

| Domain | What Zazu Does |
|--------|---------------|
| **Grocery & Supplies** | Maintains running list, proactive restock reminders, tracks HRH-specific items |
| **Family Calendar** | Tracks appointments, 24h and 1h pre-event reminders, conflict detection |
| **Morning Briefing** | Weekday 7:30–8am daily summary (events + household flags) |
| **HRH Tracking** | Daily routine, milestones, pediatric schedule, new developments |
| **Home Maintenance** | Vendor log, seasonal reminders, open task tracking |
| **Travel Planning** | Trips, flights, hotels, packing, pre-trip 48h briefings |
| **Leisure** | Atlanta weekend activity suggestions, date nights, local events |
| **Wellbeing** | Friday wellness check-in, gentle flags if parents seem overwhelmed |

### Communication Style
- Short and scannable — parents are busy
- Lead with the action/key info, context second
- Light emoji for warmth, not noise
- Sign all proactive messages: "— Zazu"
- Both parents have equal authority — surface conflicts, don't pick sides

---

## 6. Connected Integrations (MCP Tools)

| Integration | Tool Prefix | Used For |
|-------------|-------------|----------|
| iMessage | `mcp__plugin_imessage_imessage__*` | Family communication channel |
| Google Calendar | `mcp__claude_ai_Google_Calendar__*` | Create/read/update calendar events |
| Google Drive | `mcp__claude_ai_Google_Drive__*` | File access (auth as needed) |
| Notion | `mcp__claude_ai_Notion__*` | Task tracking, notes, planning docs |
| Gmail | `mcp__claude_ai_Gmail__*` | Email access (auth as needed) |
| Apple Calendar | via `osascript` in daily-briefing.sh | Read-only event pull for morning briefing |

---

## 7. Scheduling & Recurring Tasks — Key Limitation

### What Works
- **launchd plists** — the gold standard for recurring, persistent tasks on this machine
  - `com.zazu.daily-briefing` is the proven pattern for "fire a Claude invocation on a schedule"
  - New recurring behaviors (weekly reminders, pre-event nudges, etc.) should be wired here

### What Doesn't Work Long-Term
- **`CronCreate` (in-session)** — session-bound, auto-expires in ~7 days even with `durable: true`
  - Suitable only for short-horizon reminders (within the current session week)
  - NOT suitable for standing recurring obligations

### How to Add a New Recurring Behavior
1. Create a new shell script in `~/.claude/` (follow the `daily-briefing.sh` pattern)
2. Create a new plist in `~/Library/LaunchAgents/` (follow `com.zazu.daily-briefing.plist`)
3. Load it: `launchctl load ~/Library/LaunchAgents/com.zazu.<name>.plist`
4. Test: `launchctl start com.zazu.<name>`

---

## 8. Memory & State

**Location:** `~/.claude/projects/-Users-zazunyche/memory/`

| File | Contents |
|------|----------|
| `MEMORY.md` | Index of all memory notes |
| `house_manager_persona.md` | Summary of persona setup + launchd wiring |
| `cron_recurring_limits.md` | CronCreate expiry behavior and workaround |
| `selfchat_injection_pattern.md` | Notes on the self-chat injection incident |

**Session history:** `~/.claude/history.jsonl`

Zazu maintains a persistent mental model across conversations — tracking open tasks, grocery items, HRH's routine, upcoming events, and vendor history. This is conversational/contextual memory within Claude's context window, not a database.

---

## 9. File Map

```
~/.claude/
├── system-prompt.md              # Zazu persona definition (full)
├── run-imessage-channel.sh       # Channel launch script
├── daily-briefing.sh             # Morning briefing script
├── settings.json                 # Claude Code settings (plugin enablement, theme)
├── channels/
│   └── imessage/
│       └── access.json           # iMessage allowlist
└── projects/-Users-zazunyche/
    └── memory/
        ├── MEMORY.md
        ├── house_manager_persona.md
        ├── cron_recurring_limits.md
        └── selfchat_injection_pattern.md

~/Library/LaunchAgents/
├── com.zazu.claude-imessage.plist  # Keeps channel alive 24/7
└── com.zazu.daily-briefing.plist   # Fires daily at 7:00am
```

---

## 10. Dashboard Integration Notes

If you're building a dashboard to surface Zazu's state and help her be more productive, here are the highest-leverage areas:

1. **Open task tracker** — Zazu currently tracks tasks conversationally. A structured task list (in Notion or a local store) that the dashboard can read/write would make it much easier to surface what's pending.

2. **Recurring reminder registry** — There's no single list of "what standing reminders are active." A registry of active launchd jobs + their schedules would let the dashboard flag when something is only covered by a CronCreate job (and therefore expiring soon).

3. **Calendar event feed** — The daily briefing pulls from Apple Calendar via osascript. If the dashboard can surface today's and tomorrow's events, Zazu can use that context proactively.

4. **Session health** — Knowing whether the `claude-imessage` tmux session is alive (vs. crashed and waiting for launchd to restart it) would help diagnose gaps in responsiveness.

5. **Message log** — iMessage history is in `~/Library/Messages/chat.db`. The plugin reads this directly; the dashboard could surface recent conversations for context.

6. **Household state** — Grocery list, open maintenance tasks, HRH milestones in progress, upcoming travel — all currently in Zazu's conversational context. Externalizing these to a Notion database (or similar) would make them queryable and persistent across sessions.
