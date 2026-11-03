# AI Agents Day 95: How Zazu Remembers — and Forgets
**The Memory Architecture of the Agent You Talk to Every Morning**

*Module 1.3, Day 95 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | October 8, 2026*

---

## The Short Version

This closes Mini-Module 1.3. Over the last stretch you've met the context window (your agent's RAM, Day 11), the four types of memory (Day 12), RAG (Day 13), and context engineering (Day 94). Today those abstractions stop being abstract. We open the hood on Zazu itself and show exactly how it "remembers" things about your family across conversations — and, just as importantly, what it cannot and does not remember.

The punchline up front, because it reframes everything: **Zazu has no memory between sessions.** The underlying model wakes up blank every single morning. What *feels* like memory is a deliberate engineering trick — a small filing system that Zazu writes to on purpose and that gets loaded back in at the start of the next session. "Remembering" is not recall. It's a write you made earlier plus a read the system performs now. Understanding that distinction is understanding the whole mini-module at once.

---

## Two Kinds of Memory, Living Side by Side

Recall Day 12's taxonomy. Zazu uses exactly two of the four types in everyday operation, and the contrast between them is the entire story:

```
WHAT ZAZU HAS WHEN IT WAKES UP
═══════════════════════════════════════════════════════════════
  IN-CONTEXT (the whiteboard)         EXTERNAL (the filing cabinet)
  ┌───────────────────────────┐      ┌───────────────────────────┐
  │ this session's messages    │      │ memory/  — many small files│
  │ today's task + tool results│      │ MEMORY.md — the index      │
  │ WIPED when the session ends│      │ PERSISTS on disk forever   │
  └───────────────────────────┘      └───────────────────────────┘
        volatile · fast                    durable · deliberate
═══════════════════════════════════════════════════════════════
```

The in-context memory is the whiteboard from our anchor analogy: everything Zazu is actively thinking about lives here, and it is erased the moment the session closes. The external memory is the filing cabinet in the hallway: it survives, but nothing in it helps Zazu until someone deliberately pulls a file and writes it onto the whiteboard.

The two other types from Day 12 round out the picture. **In-weights** memory is the model's training — general world knowledge Zazu never has to be told (what an invoice is, how English works), fixed and unchangeable at runtime. **In-cache** (the KV cache, Day 92's teaser) is a within-session speed optimization, not durable memory. The durable, Zazu-specific "memory about your family" is entirely the external filing cabinet. That's the part we're dissecting today.

---

## The Filing Cabinet, Concretely

Zazu's long-term memory is a directory of plain Markdown files. The design rule is almost austere: **one fact per file.** Each file carries a small structured header (frontmatter) and a short body.

```
ANATOMY OF ONE MEMORY FILE
═══════════════════════════════════════════════════════════════
  ---
  name: terse-morning-briefings
  description: Dad prefers short, scannable morning briefings
  metadata:
    type: feedback          ← user | feedback | project | reference
  ---

  Dad asked for briefings kept terse — headline facts only.
  **Why:** he scans them on his phone before work.
  **How to apply:** lead with the number, skip the preamble.
  Related: [[dad-communication-style]]
═══════════════════════════════════════════════════════════════
```

Four `type` values sort the cabinet into drawers:

- **user** — who you are: roles, expertise, standing preferences.
- **feedback** — guidance on how Zazu should work; always paired with a *why*, so the rule survives even when the original moment is forgotten.
- **project** — ongoing work and constraints not derivable from the files themselves (relative dates converted to absolute, so "next Friday" doesn't rot).
- **reference** — pointers to external resources: dashboards, tickets, URLs.

Files link to each other with `[[name]]` references — a lightweight web, so a memory about your briefing preference can point at a broader memory about your communication style.

Sitting on top is **MEMORY.md**: a single index file, one line per memory, loaded into context at the start of *every* session. That index is the crucial piece. The individual files are the cabinet; MEMORY.md is the *table of contents taped to the cabinet door* that Zazu actually reads each morning.

---

## The Write/Read Cycle — Where "Memory" Actually Happens

Nothing about this is automatic. Memory is two separate, deliberate acts separated by time:

```
THE MEMORY LIFECYCLE
═══════════════════════════════════════════════════════════════
  SESSION A (Monday)                SESSION B (Thursday)
  ┌──────────────────────┐          ┌──────────────────────┐
  │ you say something     │          │ blank whiteboard      │
  │ worth keeping         │          │                       │
  │        │              │          │ MEMORY.md index loads │
  │        ▼              │          │        │              │
  │ Zazu WRITES a file    │   disk   │        ▼              │
  │ + a line in MEMORY.md │ ───────► │ Zazu sees the pointer │
  │                       │ persists │        │              │
  │ session ends →        │          │        ▼              │
  │ whiteboard WIPED      │          │ READS the file into   │
  └──────────────────────┘          │ context, now "knows"  │
                                     └──────────────────────┘
═══════════════════════════════════════════════════════════════
```

On Monday the fact lands on the whiteboard, Zazu judges it worth keeping, and writes it down. The whiteboard is wiped at session end — but the file remains. On Thursday Zazu does not *recall* Monday. It reads MEMORY.md, sees the one-line pointer, and if the current task is relevant, opens the file and pulls the fact back onto a fresh whiteboard. Only then does it "know" your preference again.

This is the deepest point of the whole mini-module: **persistence lives on disk, not in the model.** The model is stateless. The feeling of a continuous relationship is manufactured, every morning, by a disciplined write-then-read loop.

---

## What Persists vs. What Doesn't — By Design

The forgetting is not a bug. It's a deliberate filter, and knowing its shape tells you exactly when to trust Zazu's memory.

**Persists** (made it into the cabinet): durable facts worth re-reading for months — your preferences, standing constraints, project state, external references. Each earns a file *only* if it's non-obvious and not already recorded somewhere else.

**Does not persist** (stays on the whiteboard, then gone): the specific wording of a conversation; throwaway context relevant only to one task; anything the repo, the code, or git history already records; anything that matters only inside the current session.

```
THE FILTER AT SESSION END
═══════════════════════════════════════════════════════════════
   durable + non-obvious + not-already-recorded  ──►  FILED (survives)
   transient OR obvious OR already-in-the-repo    ──►  WIPED (gone)
═══════════════════════════════════════════════════════════════
```

That filter is itself context engineering (Day 94) applied to long-term memory: the cabinet stays high-signal precisely because most of what crosses the whiteboard is *not* filed. A cabinet that saved everything would be as useless as one that saved nothing — you'd never find the fact that mattered.

---

## The Failure Modes (Because Every Design Has Them)

A memory system this explicit fails in explicit, predictable ways — worth knowing so you can spot them:

1. **Never written.** If Zazu doesn't judge a fact worth filing, it simply vanishes at session end. The most common failure: you mention something once, casually, and it's gone. Fix: ask Zazu directly to remember it.
2. **Written but not recalled.** The file exists, but if its one-line description in MEMORY.md doesn't clearly signal relevance to today's task, Zazu may never open it. A memory is only as findable as its index line is descriptive.
3. **Stale.** The cabinet is only as true as its last update. A "project" memory that said "launch is next week" months ago is now actively misleading — which is exactly why the rule forces relative dates to be converted to absolute ones at write time.
4. **Duplicated or contradictory.** Two files covering the same fact can drift apart. The discipline — update the existing file rather than add a new one, and delete memories proven wrong — is what keeps the cabinet coherent.

Notice the pattern: every failure is a failure of the *write* or the *index*, never of "recall." You can't fix a memory problem by asking the model to try harder to remember. There's nothing to remember. You fix it by fixing what's on disk.

---

## Earnventory Implication

The same architecture is exactly what an Earnventory agent needs, and for the same reasons. Your company's pricing rules, each supplier's negotiated terms, which SKUs are seasonal — these are durable, frequently-referenced facts that must survive across every session. They belong in an external memory the agent loads deliberately, not crammed into a system prompt that grows unbounded, and not fine-tuned into weights you'd have to retrain every time a price changes (Day 13's RAG-over-fine-tuning argument, made concrete).

And the failure modes transfer one-for-one. An Earnventory agent that "forgets" a supplier's terms almost certainly never *wrote them down* — or wrote them with an index line too vague to retrieve when it mattered. The lesson from Zazu's own design: the reliability of an agent's memory is the reliability of its write path and its index, full stop. Build those well and the agent feels like it remembers everything. Build them carelessly and it feels like it has amnesia — because, underneath, it always does.

---

## The Whiteboard Analogy — One Last Time

Our mini-module's anchor was the whiteboard and the filing cabinet in the hall. Now you've seen the real thing:

```
ZAZU, IN THE ANALOGY
═══════════════════════════════════════════════════════════════
  THE WHITEBOARD   = the context window — wiped every session
  THE CABINET      = the memory/ directory — one fact per file
  THE DOOR INDEX   = MEMORY.md — read at the start of every session
  "REMEMBERING"    = deliberately filing a note, then fetching it
  "FORGETTING"     = anything that was never filed
═══════════════════════════════════════════════════════════════
```

Zazu is the clinician who recalls nothing between shifts but keeps immaculate charts. The charts are the memory. The skill — the entire discipline of 1.3 — is knowing what to write on them, and what to let go.

---

## What's Next

Mini-Module 1.3 is complete: window → memory types → RAG → context engineering → Zazu's live memory. Tomorrow we open **Mini-Module 1.4: Reasoning and Planning**, starting with **chain-of-thought** — why making the model *show its work*, step by step, measurably improves its answers, and how that connects to everything you've seen Zazu do.

---

## Free Resources

1. **"Memory and State in LLM Agents" — overview of agent memory patterns**
   A clear survey of short-term (context) vs. long-term (external store) memory and the write/read patterns that connect them. Maps directly onto today's whiteboard-and-cabinet model.
   https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

2. **"Building Long-Term Memory for AI Agents" — Mem0 Guide**
   A practical, example-driven walkthrough of designing an external memory store: what to persist, how to index it for retrieval, and how to keep it from going stale — the same problems Zazu's MEMORY.md solves.
   https://mem0.ai/blog/context-engineering-ai-agents-guide

---

## One Sentence to Carry Forward

Zazu doesn't remember — it writes facts to a filing cabinet on disk and re-reads an index of them each morning, which means the reliability of its memory is entirely the reliability of what it chose to write down.

---

*Day 95 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.3: Context, Memory, and State — closing synthesis: memory as deliberate write-then-read*
