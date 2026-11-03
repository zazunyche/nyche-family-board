# AI Agents Day 93: When the Whiteboard Fills Up — The Compaction Problem
**What Happens When a Long Task Outgrows the Context Window — and the Strategies That Keep It Running**

*Module 1.3, Day 93 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | October 6, 2026*

---

## The Short Version

Every context window is finite. A short conversation never comes close to the limit. But a real agentic task — the kind Zazu or Claude Code runs for an hour across dozens of tool calls — accumulates content continuously: your messages, the agent's reasoning, every tool call, and every tool result. That pile only grows. Left unmanaged, it eventually exceeds the window and the agent can no longer function.

The solution production agents use is **compaction**: when the context gets close to full, the agent compresses the older portion of the conversation into a summary, discards the raw turns it summarized, and continues working with the summary standing in for the original. This buys effectively unbounded session length — at the cost of fidelity. Compaction is lossy by definition, and understanding *what it loses* is the key to working with long-running agents effectively.

---

## Why the Pile Grows — and Why It Matters

Recall from Day 11 that the context window is the agent's RAM: a fixed token budget that holds everything the model can currently reason about. Now watch what happens during a real task.

```
CONTEXT GROWTH OVER A LONG AGENTIC TASK
═══════════════════════════════════════════════════════════════
TURN 1    [system prompt][memory][your request]            ~5%
TURN 5    + 4 tool calls + 4 tool results                  ~22%
TURN 12   + file reads (large!) + reasoning + more tools   ~55%
TURN 20   + more reads + search results + edits            ~84%
TURN 24   ░░░░░░░░░░░░░░░░ APPROACHING LIMIT ░░░░░░░░░░░░░   ~97%
          → must compact, or the next turn won't fit
═══════════════════════════════════════════════════════════════
```

The biggest contributors are usually **tool results**, not the conversation itself. Reading a 600-line file, running a search that returns 50 matches, fetching a web page — each dumps a large block of text into the window that stays there for the rest of the session even after it has served its purpose. By turn 20, most of the window is often occupied by file contents the agent looked at once and no longer needs verbatim.

This is why a casual chat with Zazu never hits the limit but a multi-step task ("audit these files and fix the bug") can: the chat adds a few hundred tokens per turn; the task adds thousands.

---

## What Compaction Actually Does

When the agent detects it's approaching the limit, it performs a compaction pass. Mechanically:

```
THE COMPACTION OPERATION
═══════════════════════════════════════════════════════════════
BEFORE                          AFTER
┌──────────────────────────┐    ┌──────────────────────────┐
│ system prompt            │    │ system prompt            │
│ memory                   │    │ memory                   │
│ turn 1 … turn 18         │ →  │ ┌──────────────────────┐ │
│   (raw: every message,   │    │ │ SUMMARY of turns     │ │
│    tool call, tool        │    │ │ 1–18: what was done, │ │
│    result, in full)      │    │ │ decided, found, and  │ │
│ turn 19                  │    │ │ still pending        │ │
│ turn 20                  │    │ └──────────────────────┘ │
│                          │    │ turn 19 (raw)            │
│                          │    │ turn 20 (raw)            │
└──────────────────────────┘    └──────────────────────────┘
   ~97% full                       ~40% full — room to continue
═══════════════════════════════════════════════════════════════
```

The older turns are replaced by a model-written summary — typically covering what was accomplished, what decisions were made and why, what was learned, and what work remains. The most recent turns are usually kept raw, because they're the ones most likely to matter for the immediate next step. The result: the window drops back to a fraction of its full state, and the agent keeps going as if nothing happened — except the first eighteen turns now exist only as a paragraph.

This is the same lossy boundary you met on Day 15, but moved *inside* a single session. There, the loss happened at session end (anything un-filed was gone). Here, the loss happens mid-session, every time the window fills: anything the summary didn't capture is gone, even though the session is still running.

---

## Why Compaction Is Lossy — Structurally

Compaction can't be lossless. The whole point is to represent N tokens of history in far fewer than N tokens. Compression that preserved everything wouldn't free any space. So the summarizer must *choose* what survives, and that choice is a prediction: "what from this history will matter later?" Like any prediction, it can be wrong.

The characteristic failures:

- **The dropped detail.** A specific value — an exact file path, a number, an edge case the agent noticed in passing — doesn't make the summary because it didn't look important at compaction time. Three turns later it turns out to be exactly what's needed, and the agent no longer has it. It may re-derive it (another file read) or, worse, hallucinate it.
- **Goal drift.** The *reason* a task was being done a certain way lives in the early turns. If the summary preserves *what* but not *why*, the agent can continue executing while slowly losing the thread of the original intent — doing something locally reasonable that no longer serves the actual goal.
- **Re-work loops.** The agent forgets it already tried an approach that failed, because the failed attempt got compressed to a single line or dropped entirely. It tries the same thing again. Multi-step agents without careful compaction can get into cycles this way.

None of these are bugs in the usual sense. They're the unavoidable cost of representing a long history in a short space — the same trade-off a human makes when they summarize a two-hour meeting in five bullet points.

---

## Mitigation Strategies

This is why the mini-module calls context a *first-class engineering discipline*. You don't just let the window fill and hope the summary is good. The strategies that production agents use:

**1. Externalize before you compact.** The most reliable fix is to not rely on the summary for anything durable. If an important decision or fact emerges mid-task, write it to a memory file or a scratch file on disk *now* — while it's still in full context. Then even if compaction drops it from the window, it survives on disk and can be re-read. This is exactly why Zazu writes memory files during a session rather than waiting until the end: disk is the backstop for a lossy window.

**2. Keep tool results lean.** Since tool results are the biggest consumers, design tools to return only what's needed. A search tool that returns matching line numbers and short excerpts costs far less than one that returns whole files. The less junk enters the window, the later you hit the limit, and the fewer compactions you incur over a task.

**3. Summarize deliberately, not just automatically.** A well-engineered agent can be prompted to produce a structured summary at natural checkpoints — "state the goal, decisions so far, open questions, and next step" — rather than relying on a generic end-of-window compaction. A structured, intentional summary loses less of what matters than an emergency compression at 97% full.

**4. Sub-divide the task.** If a job is too big to fit even with compaction, split it. Give each piece to a fresh context (or a subagent — the whole of Module 2.2) with a clean window and a tight brief. This trades compaction loss for handoff loss, but handoffs can be designed and inspected; emergency compaction can't.

```
THE DECISION: ONE WINDOW vs. SPLIT
═══════════════════════════════════════════════════════════════
Task fits comfortably?        → one window, no compaction needed
Task long but coherent?       → one window + externalize to disk
Task huge or parallelizable?  → split across fresh contexts/subagents
═══════════════════════════════════════════════════════════════
```

---

## Earnventory Implication

Picture an Earnventory agent reconciling a month of supplier invoices against purchase orders — hundreds of line items, each requiring a lookup. That task will blow past a single context window. If you let it run naively, compaction will kick in repeatedly, and somewhere around invoice #140 it may "forget" a pricing exception it noted at invoice #12 and silently mis-reconcile.

The engineered version: the agent writes each resolved discrepancy to a running ledger file on disk as it goes, keeps tool results to one-line-per-invoice summaries, and checkpoints its progress. Now compaction can drop the raw history freely — the durable record lives on disk, not in the window. The window becomes a workspace, not the system of record. That distinction — *window as scratch space, disk as truth* — is the single most important habit for building long-running agents that stay reliable.

---

## The Whiteboard Analogy — Extended

Our mini-module anchor was the whiteboard. Compaction is what you do when it fills up mid-meeting:

```
THE FULL WHITEBOARD
═══════════════════════════════════════════════════════════════
WHITEBOARD FILLS UP   ← context approaches the token limit
PHOTOGRAPH + CAPTION  ← summarize the old content
WIPE THE BOARD        ← discard the raw turns that were summarized
KEEP WORKING          ← continue from the caption, not the photo
WHAT THE CAPTION      ← the lossy part: un-captioned details are gone
  LEFT OUT            
NOTEBOOK ON THE DESK  ← disk/memory: the backstop that survives wiping
═══════════════════════════════════════════════════════════════
```

You can only reason from what's on the board right now. When it fills, you compress and wipe — so the discipline is to make sure anything you'll truly need later is either in the caption *or* written in the notebook, because the raw board is about to disappear.

---

## What's Next

Tomorrow continues the theme: **context engineering** — the practice of deliberately deciding what belongs in the window in the first place, so that compaction loses as little as possible and the agent sees exactly what it needs and no more. Compaction is damage control; context engineering is prevention.

---

## Free Resources

1. **"Effective Context Engineering for AI Agents" — Anthropic Engineering Blog**
   Anthropic's own treatment of managing the context window as a finite resource, including compaction, summarization, and the trade-offs of each. The authoritative frame for everything in this mini-module.
   https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

2. **"Managing Context on the Claude Developer Platform" — Anthropic Documentation**
   Practical documentation on context-window limits, compaction behavior, and the controls you have over long-running sessions — directly relevant to what you see when Claude Code compacts a long task.
   https://docs.anthropic.com/en/docs/build-with-claude/context-windows

---

## One Sentence to Carry Forward

A finite context window means a long task must eventually compress its own history, and that compression is lossy — so the durable record of what matters belongs on disk, not in the window, which is scratch space that can be wiped at any moment.

---

*Day 93 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.3: Context, Memory, and State — the compaction problem*
