# AI Agents Day 94: Context Engineering — Deciding What the Model Sees
**Why Managing the Window Is a First-Class Engineering Discipline — Not an Afterthought**

*Module 1.3, Day 94 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | October 7, 2026*

---

## The Short Version

Yesterday you met **compaction** — what an agent does when a long task fills its context window: summarize the old turns, drop the raw history, keep going. Compaction is *reactive*. It's the cleanup crew that shows up after the window is already 97% full.

Today's topic is the *proactive* counterpart: **context engineering** — the practice of deliberately deciding what enters the context window in the first place, so the model sees exactly what it needs to do the task and as little else as possible.

The one-line relationship: **compaction is damage control; context engineering is prevention.** A well-engineered context triggers fewer compactions, loses less to them when they happen, and produces better answers because the model isn't distracted by irrelevant material. This is why practitioners now say context engineering has largely *subsumed* prompt engineering as the core skill of building agents. Writing a clever prompt is a small part of it. Deciding what else shares the window with that prompt is the rest.

---

## Why "Prompt Engineering" Wasn't Enough

In the early days of LLMs, the whole game was the prompt: phrase your request well and you got a better answer. That still matters. But it assumed a simple world — one human message in, one answer out.

An agent breaks that assumption. By the time the model generates a single token, its context window may contain:

```
WHAT SHARES THE WINDOW IN A REAL AGENT TURN
═══════════════════════════════════════════════════════════════
┌─────────────────────────────────────────────┐
│ SYSTEM PROMPT    identity, rules, tool defs   │  you wrote this
├─────────────────────────────────────────────┤
│ MEMORY / RETRIEVED FACTS   files, RAG hits    │  a pipeline chose this
├─────────────────────────────────────────────┤
│ TOOL RESULTS     file reads, search output,   │  the world dumped this
│                  API responses, web pages     │  in — often huge
├─────────────────────────────────────────────┤
│ CONVERSATION     your turns + the agent's     │  accumulates every turn
├─────────────────────────────────────────────┤
│ THE ACTUAL PROMPT   "summarize these emails"  │  the small part
└─────────────────────────────────────────────┘
═══════════════════════════════════════════════════════════════
```

The prompt is one slice of five. The other four are where answers are quietly won or lost — and unlike the prompt, they're often populated by *machinery* (a retrieval step, a tool, an accumulating history), not by a human carefully choosing words. Context engineering is the discipline of governing all five streams, especially the ones that fill themselves.

---

## The Core Principle: Signal, Not Volume

The instinct of a new agent builder is to give the model *everything* — the whole document, the entire inbox, all 200 SKUs — on the theory that more information can't hurt. It can, in three distinct ways:

1. **Cost and latency.** Every token in the window is a token you pay for and a token the model must process. A window stuffed with irrelevant material is slower and more expensive on *every* turn it survives.
2. **The limit arrives sooner.** Junk you put in early occupies space for the rest of the session. It's what forces compaction at turn 20 instead of turn 40 — and every compaction risks losing something real (Day 93).
3. **Distraction degrades reasoning.** This is the non-obvious one. Models attend to everything in context. Bury the three relevant sentences inside thirty irrelevant pages and the model's attention is diluted across all of it. A leaner, more relevant context frequently produces a *more accurate* answer than a bloated one — not just a cheaper one. More is not better. Relevant is better.

The mental shift: treat the context window as a **scarce, curated resource**, not a dumping ground. Your job is to maximize the *signal-to-noise ratio* of what the model sees.

```
TWO WAYS TO FILL A WINDOW FOR THE SAME TASK
═══════════════════════════════════════════════════════════════
NAIVE (volume)                    ENGINEERED (signal)
┌──────────────────────────┐      ┌──────────────────────────┐
│ full 90-email inbox       │      │ 6 unread supplier emails  │
│ every signature & legal   │      │ bodies only, sigs stripped│
│ footer, every quoted      │      │ quoted threads removed    │
│ reply chain, 3 newsletters│      │                           │
│ ...                       │      │                           │
│ "summarize supplier mail" │      │ "summarize supplier mail" │
└──────────────────────────┘      └──────────────────────────┘
   ~40,000 tokens                     ~2,500 tokens
   model hunts for signal             model sees only signal
   may compact mid-task               fits easily, no compaction
═══════════════════════════════════════════════════════════════
```

Both get the "right" emails in front of the model. Only one does it without burying them.

---

## The Four Levers You Actually Pull

Context engineering isn't a single trick; it's a set of techniques applied to each stream in the window.

**1. Retrieval — bring in only what's relevant.**
Rather than loading an entire knowledge base, retrieve the handful of passages that match the current task (this is RAG, Day 13). The engineering judgment is *how much* to retrieve: top-3 passages, not top-50. Retrieval is as much about what you *exclude* as what you include.

**2. Compression — shrink what you do include.**
Before a large block enters the window, reduce it. Strip email signatures and quoted replies. Summarize a long document down to its relevant section. Convert a verbose API response to the three fields you need. Compression up front means the raw bulk never occupies the window at all.

**3. Tool-result shaping — control the biggest firehose.**
Tool results are usually the largest contributor to context growth (Day 93). Design tools to return *lean* output: matching line numbers and short excerpts instead of whole files; a count and a sample instead of 500 rows. The leanest possible tool result that still answers the question is the correct one.

**4. Structure — make the window legible.**
Order and label matter. Put stable content (system prompt, long-lived facts) at the top where it's predictable; put the immediate task near the bottom where the model's attention is strongest. Wrap distinct materials in clear delimiters (`<supplier_data>…</supplier_data>`) so the model can tell *your instructions* from *data it's processing* — which, as Day 33 showed, is also a security boundary against injection.

```
THE CONTEXT ENGINEERING LOOP (per agent turn)
═══════════════════════════════════════════════════════════════
   what does THIS step actually need?
            │
            ▼
   RETRIEVE only that  ──►  COMPRESS it  ──►  SHAPE tool outputs
            │                                        │
            └────────►  STRUCTURE the window  ◄──────┘
                              │
                              ▼
                 model reasons over high signal
                              │
                              ▼
                 drop what's no longer needed → next step
═══════════════════════════════════════════════════════════════
```

That last arrow — *drop what's no longer needed* — is the habit most beginners miss. A file you read on turn 5 to answer one question doesn't need to ride along for the next fifteen turns. Good context management is as much about eviction as admission.

---

## How This Connects to Everything in 1.3

This snippet is the synthesis of the mini-module. Watch the pieces line up:

- **Day 11 (the window is RAM):** context engineering is *memory management* for that RAM — deciding what gets loaded and what gets freed.
- **Day 12 (four memory types):** engineering the context means orchestrating those types — pull from external memory (RAG) into in-context, knowing in-weights can't be changed at runtime.
- **Day 13 (RAG):** retrieval is the single most powerful context-engineering lever — it's how you put the *right* external fact on the whiteboard.
- **Day 93 (compaction):** compaction is what happens when context engineering *fails or isn't enough*. The better your up-front curation, the less you lean on lossy compaction.

The discipline's name says it plainly: it's *engineering*, with trade-offs, measurable outcomes (token cost, latency, accuracy), and failure modes — not prompt-whispering.

---

## Earnventory Implication

Picture an Earnventory agent that answers: *"Which of our suppliers raised prices this quarter, and by how much?"*

The naive build dumps every supplier record, every invoice, and the full price history into context, then asks the question. That might be hundreds of thousands of tokens — expensive, slow, and likely to compact mid-task and drop a supplier.

The engineered build:
- **Retrieves** only suppliers with invoices dated this quarter (not the whole vendor table).
- **Compresses** each supplier's history to two numbers: start-of-quarter price and latest price.
- **Shapes** the database tool to return `{supplier, old_price, new_price}` rows — not raw invoice blobs.
- **Structures** the window: the pricing rules at top, the trimmed data block in the middle, the question at the bottom.

Same question, same correct answer — but now it fits in a few thousand tokens, costs a fraction, runs faster, and never risks a compaction eating a supplier. That gap between the two builds *is* context engineering, and it's the difference between a demo and a system that holds up on real data.

---

## The Whiteboard Analogy — Completed

Our mini-module anchor has been the whiteboard: the model can only reason about what's written on it right now; the filing cabinet outside holds everything else; compaction is what you do when the board fills mid-meeting.

Context engineering is the discipline that governs the *whole* whiteboard, before it ever fills:

```
THE DISCIPLINED WHITEBOARD
═══════════════════════════════════════════════════════════════
ONLY TODAY'S FILES COME OUT   ← retrieve just what the task needs
SUMMARIZE BEFORE YOU POST     ← compress large material first
WRITE SMALL, WRITE CLEARLY    ← lean, well-labeled tool results
FILE IT BACK WHEN DONE        ← evict what's no longer needed
═══════════════════════════════════════════════════════════════
```

A clean board isn't tidiness for its own sake. It's so that when the model looks up, every line it sees is one that helps. Compaction (Day 93) cleans a board that got buried. Context engineering makes sure it rarely does.

---

## What's Next

Tomorrow we close the mini-module by making it personal: **how Zazu actually remembers** — the MEMORY.md index, the one-fact-per-file memory directory, what persists across our conversations and what deliberately doesn't. Everything from windows to memory types to context engineering, shown running in the agent you talk to every morning.

---

## Free Resources

1. **"Effective Context Engineering for AI Agents" — Anthropic Engineering Blog**
   The authoritative treatment of context as a finite resource to be engineered — retrieval, compression, tool-result shaping, and the trade-offs of each. The direct source for today's framing.
   https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

2. **"Context Engineering for AI Agents" — Mem0 Guide**
   A practical, example-driven walkthrough of the techniques: what to retrieve, when to compress, and how to structure a window for a working agent. A good complement to the Anthropic piece.
   https://mem0.ai/blog/context-engineering-ai-agents-guide

---

## One Sentence to Carry Forward

Context engineering is the discipline of deciding what the model sees — curating the window for signal over volume, up front — so that the agent reasons over exactly what it needs, costs less, and rarely has to fall back on lossy compaction.

---

*Day 94 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.3: Context, Memory, and State — context engineering as a first-class discipline*
