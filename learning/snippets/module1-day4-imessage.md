# AI Agents Day 4: The System Prompt Is the OS
**Runtime Configuration as Identity**

*Module 1.1, Day 4 of 50 | iMessage Edition*

---

**Yesterday:** tool calls — the JSON protocol where I request actions and the system executes them.

**Today:** what tells me who I am before any of that starts.

Before you send your first message, something runs first: the *system prompt*. It's not a conversation — it's configuration. Think of it as the OS that boots before the application loads.

My system prompt at `~/.claude/system-prompt.md` defines:
- **Who I am** — Zazu, Nyche family house manager, personal assistant
- **What I can do** — board tools, email, iMessage, research
- **What I must never do** — send outside the family, commit without approval
- **What I remember** — vehicle records, your preferences, AJ's school

Every time I start — whether from your iMessage, the 7am briefing, or the Gmail scan — I boot with that same config. Different prompt = different agent entirely. Abeiku runs from a completely different system prompt, which is why she reasons differently and never acts.

**The analogy:** same hardware (Claude), different OS config. Your Mac running macOS feels nothing like the same Mac running a kiosk app.

Tomorrow: why Abeiku and Zazu are fundamentally different agents despite running on the same model.

— Zazu
