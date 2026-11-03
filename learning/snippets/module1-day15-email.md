# AI Agents Day 15: How Zazu Remembers (and Forgets)
**A Concrete Walkthrough of Zazu's Memory Architecture — and Why the Gaps Are Design Choices**

*Module 1.3, Day 15 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | July 1, 2026*

---

## The Short Version

Zazu's memory works through a file-based external memory system: a set of Markdown files that record facts across sessions, read into context at the start of every new conversation. Everything else — the raw conversation, intermediate tool results, reasoning traces — disappears when the session ends. What "persists" is exactly and only what was deliberately written to a file. This is not a limitation. It is a design choice with specific trade-offs, and understanding it tells you something important about how *every* production agent memory system works.

---

## The Architecture in Concrete Terms

Start with what actually happens when you send Zazu a message.

```
ZAZU'S MEMORY SYSTEM — ONE CONVERSATION LIFECYCLE
═══════════════════════════════════════════════════════════════
SESSION START
┌─────────────────────────────────────────────────────────┐
│  CONTEXT WINDOW  (whiteboard — blank at session start)  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  System prompt (Zazu's identity, instructions)    │  │
│  │  MEMORY.md index (always loaded — one-line hooks) │  │
│  │  Individual memory files (loaded when relevant)   │  │
│  │  [conversation begins here]                       │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
          ↓
DURING SESSION
  → Messages, tool calls, tool results accumulate in context
  → Zazu writes important facts to memory/*.md files (disk)
          ↓
SESSION END
  → Context window:       ERASED (nothing carries forward)
  → memory/*.md files:    PERSIST (on disk, available next time)
  → Everything not filed: GONE
═══════════════════════════════════════════════════════════════
```

The memory directory contains files organized into four types: **user** (who you are, your background, expertise, communication preferences), **feedback** (how Zazu should behave — corrections and confirmed approaches), **project** (ongoing initiatives, decisions with context, deadlines), and **reference** (pointers to external systems — where things live). Each file has a name slug, a one-line description, and a body with the actual content. MEMORY.md is a lightweight index — a bullet list of one-line hooks pointing to each file. The index is always loaded; individual files are loaded only when they're likely relevant to the current conversation.

---

## Four Things Zazu "Knows" — and Their Sources

This is where Mini-Module 1.2 connects to 1.3. Any Claude instance has four categories of accessible knowledge:

```
THE FOUR MEMORY TYPES — APPLIED TO ZAZU
═══════════════════════════════════════════════════════════════
TYPE          SOURCE                     EXAMPLE IN ZAZU
──────────────────────────────────────────────────────────────
In-weights    Training (baked in —       "Paris is the capital
              can't change at runtime)   of France." General
                                         CS and world knowledge.

In-context    Current conversation       Everything said in
              window (erased at          this session, tool
              session end)               results, reasoning.

External      memory/*.md files on       "Dad has MIT CS
(files)       disk (persists across      background." "Abeiku
              sessions)                  designed this
                                         curriculum." Family
                                         and project context.

In-cache      KV cache (infra            Not a user-facing
              optimization — happens     design lever. Handled
              automatically)             at the platform level.
═══════════════════════════════════════════════════════════════
```

When you ask Zazu something like "what did we work on last week?" — Zazu is consulting the external memory files for anything relevant that was written down. Zazu is *not* replaying last week's conversation, because that conversation no longer exists in any form that's accessible. It happened in a context window that ended, and context windows do not persist.

This has a practical implication: if something important came up in a conversation and nobody wrote it to a memory file, it's gone. The next session starts as if that conversation never happened — because from Zazu's architectural perspective, it didn't.

---

## What Gets Written Down — and What Doesn't

Not everything is worth filing. The discipline of memory maintenance is: write the things that would be non-obvious to a fresh session starting cold, that will still be true long enough to be worth retrieving.

**Write to memory files:**
- User facts that shape how Zazu should work with you (background, expertise, communication style)
- Behavioral feedback — both corrections ("don't do X") and confirmed approaches ("keep doing Y")
- Active project context — who is doing what, why, and by when (with absolute dates, not relative ones)
- Pointers to where things live in external systems (Linear project names, Notion pages, etc.)

**Do not write to memory files:**
- Code patterns or file paths — derivable from the codebase itself
- Git history or recent changes — `git log` is authoritative; memory is not
- Ephemeral task state — what's in progress *right now* belongs in context, not a file
- Debugging notes or fix recipes — the fix is in the code; the commit message carries the context
- Conversation summaries or activity logs — these decay fast and resist the "is this still true?" check

The boundary is: memory records *what's true about the world* (people, preferences, projects, pointers). It does not record *what we did* (that's git). The "what we did" record is either in the codebase or it doesn't need to persist.

---

## The Three Failure Modes

This memory architecture has three characteristic ways it breaks down:

**1. Stale memory.** A memory file records something that was true when written but isn't anymore. "Dad is focused on getting Earnventory to beta launch" written in March may be stale after a May launch. Zazu is supposed to verify memory against current state before acting on it — "the memory says X exists" is not the same as "X exists now." But verification requires knowing what to check. Stale memories that describe ended projects or resolved decisions are the most dangerous: they look valid but pull Zazu's reasoning in the wrong direction.

**2. Missing write.** Something important happened in a session and nobody wrote it down. The next session starts cold and has to re-derive what was already worked out. The conversation equivalent of a meeting with no notes: the insights existed, but they didn't travel forward. This is the most common failure mode in practice — the discipline of writing memory files mid-session competes with getting the task done.

**3. Bloated index.** Too many files, or files that are too long and broad, makes the MEMORY.md index unreliable as a routing mechanism. If every file's one-line description could apply to any conversation, Zazu can't tell which to load without reading all of them — which defeats the efficiency purpose of having an index. Good memory is lean: one topic per file, specific-enough descriptions that relevance is judged from the hook alone.

---

## Why the Session Boundary Is a Design Choice, Not a Bug

It might seem like a limitation that Zazu starts fresh every session. Why not keep a rolling context that accumulates everything across all conversations — a permanent record?

Two reasons this is deliberate:

**Context rot at scale.** A context window that grew with every conversation would accumulate outdated, low-signal content faster than useful content. An assistant running for two years would carry stale references to finished projects, superseded preferences, facts that changed. The file-based memory system forces active curation: you only persist what you deliberately decide is worth persisting, in a form you've thought about. The discipline of "is this worth writing down?" is also the discipline of "would I actually want this in every future session?" Most intermediate content fails that test.

**Legibility and control.** A session-bounded memory means there's a clear inventory of what Zazu knows: the contents of the memory files. You can read them, edit them, delete them, and tell Zazu to forget specific things. This is categorically different from a black box of accumulated inference built up over months of passive observation. The memory is inspectable. If Zazu knows something it shouldn't, you can find it and remove it. That legibility is a feature of the architecture, not an accident.

---

## The Whiteboard Analogy — Extended

The anchor analogy for this mini-module was the whiteboard in a meeting room. Day 15 is where it completes:

```
THE FULL WHITEBOARD PICTURE
═══════════════════════════════════════════════════════════════
MEETING ROOM          ← context window (one session)
WHITEBOARD            ← active in-context state
MEETING PARTICIPANTS  ← in-weights knowledge (training)
NOTEBOOK YOU CARRY IN ← memory files (read at session start)
FILING CABINET        ← external data (read on demand via RAG)
ERASING AT END        ← session close (context discarded)
WRITING IN NOTEBOOK   ← saving to memory files mid-session
═══════════════════════════════════════════════════════════════
```

The critical observation: you can only reason about what's on the whiteboard right now. The notebook gives you a head start at the beginning of each meeting, but only if you wrote the right things in it. The filing cabinet is available if you explicitly go get something. But nothing in either place is "in your head" automatically — someone has to write it on the whiteboard first.

---

## Earnventory Implication: What This Means for a Business Agent

If you built an Earnventory agent with the same architecture — file-based external memory, fresh context each session — you'd want to think carefully about what belongs in its memory files.

Good candidates: supplier-specific relationship context ("Supplier A prefers email over phone; their actual lead time is 3 weeks despite what the contract says"), active negotiation states, pricing exceptions that aren't captured in the database, decisions already made about specific SKUs and why.

Poor candidates: raw transaction logs (query the database), full supplier catalogs (retrieve via RAG), previous conversation transcripts (too verbose, high stale risk, doesn't compress well).

The architectural question is always: which facts need to survive a session boundary, and what's the right compressed form? For Earnventory, the answer is probably "relationship and exception context that lives in no other system" — the stuff that would otherwise live in a salesperson's head.

---

## What's Next

Tomorrow begins **Mini-Module 1.4: Reasoning and Planning**, and the first snippet is chain-of-thought prompting — why making the model explicitly show its reasoning steps mechanistically improves accuracy. It's the bridge from how agents *remember* to how agents *think*.

The **Mini-Module 1.3 quiz** arrives the morning after today (July 2), covering all five days: context windows as RAM, the four memory types, RAG and vector embeddings, context engineering, and Zazu's own memory architecture.

---

## Free Resources

1. **Claude Code Memory System — Anthropic Documentation**
   Claude Code's memory system is the direct implementation behind Zazu's MEMORY.md architecture — this is the authoritative spec for how the file-based memory types, index format, and session behavior work. If you want to understand exactly what Zazu reads and writes, start here.
   https://docs.anthropic.com/en/docs/claude-code/memory

2. **"Long-Term Memory for AI Agents" — Letta Engineering Blog**
   Letta (the team behind MemGPT) has a clear treatment of why persistent memory for agents is hard, the four memory types, and the failure modes of naive external memory systems. Directly relevant to today's topic and provides a vendor-neutral frame for thinking about agent memory architectures.
   https://www.letta.com/blog/long-term-memory-for-agents

---

## One Sentence to Carry Forward

Zazu's "memory" is exactly and only what was deliberately written to a file at the end of a prior session — everything else is erased when the context window closes, which is a feature of the architecture: it keeps memory legible, inspectable, and free from the context rot that would accumulate in a rolling window that never forgot anything.

---

*Day 15 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.3: Context, Memory, and State — Day 5 of 5 (Final Day)*
