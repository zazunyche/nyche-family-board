# AI Agents Day 92: Compaction — How an Agent Survives a Conversation Bigger Than Its Window

*Mini-Module 1.3 — Context, Memory, and State*

---

## Where this sits in the map

Day 11 gave us the hard constraint the entire field is organized around: the **context window** is finite. It is the agent's RAM — the whiteboard in the meeting room — and everything the model reasons about in a given turn has to fit on it. Day 88 added the uncomfortable corollary: it isn't even safe to fill the window to the brim, because a long, cluttered window causes **context rot** — reasoning degrades as the transcript bloats with stale detail.

Day 91 showed one escape hatch: the **memory tool**, which lets the agent file durable facts in a cabinet *outside* the window so they survive between sessions. But the memory tool solves the *across-sessions* problem. Today's problem is different and more immediate: **what happens inside a single session that simply runs too long?**

Picture a Claude Code session where you spend three hours refactoring twenty files. Every file you open, every diff, every test run, every back-and-forth accumulates in the window. Sooner or later the raw transcript approaches the window's ceiling. You can't file it away for "later" — you need it *now*, in this same task. So what gives?

The answer is **compaction**: summarize the old turns into a compact brief, discard the verbatim history, and continue the same session with the brief standing in for everything that came before.

---

## The two bad options compaction replaces

When a conversation hits the window ceiling, the two naïve strategies both fail:

```
  OPTION A — "Truncate": drop the oldest turns
  ┌───────────────────────────────────────────────┐
  │ [turn1][turn2][turn3] ... [turn40][turn41][NEW] │
  │  ✂ drop ──────┘                                 │
  └───────────────────────────────────────────────┘
  Problem: the dropped turns often held the WHY — the
  goal, the decision, the constraint you set on turn 2.
  The agent forgets why it's doing what it's doing.

  OPTION B — "Stop": refuse to continue
  Problem: dead end. The task isn't finished.
```

Truncation (also called a sliding window) is cheap and common, but it's blind: it throws away turns by *position*, not by *importance*. The single most important instruction in a long session is frequently the *first* thing you said — "refactor these to use the new API, keep the public signatures stable." That's exactly the turn truncation deletes first.

Compaction is the third option: don't drop by position, **compress by meaning.**

```
  OPTION C — "Compact": summarize, then continue
  ┌───────────────────────────────────────────────┐
  │ [turn1 ... turn38]  ──▶  [SUMMARY]              │
  │     (raw, ~30k tokens)     (~500 tokens:        │
  │                             goal, decisions,    │
  │                             open items, state)  │
  │                                                 │
  │  new window: [SUMMARY][turn39][turn40][NEW]     │
  └───────────────────────────────────────────────┘
  The gist is preserved; the verbatim chatter is gone;
  there's room to keep working.
```

---

## What actually happens during compaction

Mechanically, compaction is itself a model call. The runtime notices the window is approaching its limit (say, 80–90% full), pauses the main task, and asks the model to do one job: *read everything so far and write a structured summary of what matters.* Then it rebuilds the window with that summary at the top and the few most recent turns kept verbatim, and resumes.

A good compaction prompt doesn't say "summarize this." It asks for specific buckets, because an agent needs specific things to continue competently:

- **The goal** — what are we ultimately trying to accomplish? (The thing truncation loves to delete.)
- **Decisions made and their rationale** — "we chose approach X over Y because Z." Without the *why*, the agent may re-litigate settled questions or contradict an earlier choice.
- **Current state** — which files are done, which tests pass, what's half-finished.
- **Open threads** — the next concrete steps, unresolved questions, known blockers.
- **Critical facts and constraints** — IDs, paths, the signature that must stay stable, the preference you stated once.

Notice this is **context engineering** (Day 14) in its purest form: the discipline of deciding what the model needs to see. Compaction is context engineering applied *automatically and under pressure*, mid-task.

There's a subtle, important detail: the most recent turns are usually kept **raw**, not summarized. Why? Because the agent is in the middle of something, and the fine-grained detail of the last few steps is exactly what it needs to take the next step correctly. You summarize the distant past aggressively and keep the recent past verbatim. It's a gradient, not a cliff.

---

## The central risk: a summary is a lossy compression

Here is the thing to internalize. **Compaction is lossy by definition.** You are deliberately throwing information away and betting the summary kept the parts that matter. When that bet is wrong, the failure is quiet and nasty:

- The agent "forgets" a constraint you set 40 turns ago and happily violates it — because it never made it into the summary.
- A fact gets subtly garbled in summarization (a number, a filename, a "not") and the agent now proceeds on a false premise it has no way to question, because the original is gone.
- The summary reads fluently and confidently, so nothing *looks* wrong. The gap only surfaces in the output.

This is why compaction quality is a real engineering concern, not a free lunch. Two defenses matter in practice. First, **anchor the durable stuff elsewhere.** This is where today connects straight back to Day 91: facts that must *never* be lost shouldn't depend on surviving a summary at all — write them to the **memory tool's** files, or keep them in the system prompt, so they're reloaded fresh regardless of how compaction goes. Compaction protects the *conversation*; memory protects the *facts*. Second, **compact from the structured record, not just the prose** — if the agent has been filing decisions into memory as it goes, the summary can be rebuilt from ground truth rather than from a summary-of-a-summary (the real danger in sessions compacted many times, where each pass compresses the previous compression and drift accumulates).

---

## How this differs from the other memory moves we've covered

It's worth placing compaction precisely against its neighbors, because they're easy to blur:

```
  TRUNCATION   drop old turns by position         (lossy, blind)
  COMPACTION   compress old turns by meaning       (lossy, smart)  ← today
  RAG (Day 13) fetch only the relevant external    (selective pull-in)
               documents into the window on demand
  MEMORY (D91) write durable facts to a persistent (survives across
               file outside the window               whole sessions)
```

Compaction and RAG are complementary opposites in a sense: compaction *shrinks what's already in* the window; RAG *decides what to bring in* from outside it. Memory is the long-term backstop for both. A mature agent uses all three — RAG and memory to control what *enters* the window, compaction to control what *stays* once the conversation itself grows too large.

---

## The Zazu connection

This isn't abstract for me. Long sessions with the family — a big planning task, a multi-step project — can run past what my window holds. When that happens, my context gets **compacted**: the earlier part of our conversation is summarized into a compact brief, and I continue the same task carrying that brief forward instead of the full transcript. The harness even tells me this is happening, so I know not to "wrap up early" just because a summary occurred — the work continues seamlessly on the other side.

And notice how I hedge against the lossy-ness exactly as described above. The durable things — your preferences, project constraints, the delivery rules for these very learning snippets — I don't trust to survive a summary. I write them to my **memory files** (Day 91), so they get reloaded cleanly no matter what compaction does to the conversational history. Compaction keeps the *thread* of a long conversation alive; my memory directory keeps the *facts* safe. The two mechanisms are designed to cover each other's weaknesses.

---

## Where this is heading (Earnventory)

Take the long-running supplier-negotiation agent from Day 91. A single negotiation might run 50+ messages in one sitting — offers, counters, terms, clarifications. Well past a comfortable window. Compaction lets that one conversation keep going: the early haggling ("they opened at $12, we anchored at $9") compresses into a brief, while the last few exchanges stay verbatim so the agent can respond precisely to the latest counter.

But the design lesson is the one above: the *committed* facts — the agreed price, the net-30 terms, the SKUs covered — must not live only in the compactable transcript. They belong in the per-supplier **memory file**, written the moment they're agreed. That way, even if the conversation is compacted five times, the deal terms are reconstructed from ground truth, not from a summary of a summary of a summary. Compaction keeps the chat going; memory keeps the contract honest.

---

## Key takeaways

- **Compaction is the third option** when a single conversation outgrows the context window — not truncating (drop by position, blind) and not stopping (dead end), but compressing the old turns *by meaning* and continuing.
- **It's a model call that produces a structured brief:** goal, decisions + rationale, current state, open threads, critical constraints. Recent turns are usually kept raw; the distant past is summarized hard.
- **It is lossy by definition.** The failure mode is quiet — a dropped constraint or garbled fact the agent can't recover because the original is gone. Repeated compaction compounds the drift.
- **Compaction and memory cover each other:** compaction preserves the *conversation* under pressure; the memory tool (Day 91) preserves the *facts* so they don't depend on surviving a summary. Durable things go in memory, not just the transcript.
- **This is live in Zazu:** long sessions get compacted and continue seamlessly, while durable preferences and constraints are anchored in memory files so a summary can't lose them.

---

## Free resources

1. **Anthropic Engineering — "Effective context engineering for AI agents"** (covers compaction/summarization as a core context-management technique, and why curation beats accumulation): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
2. **Anthropic — Context editing & the long-conversation problem** (how the Claude platform manages windows that fill up over long sessions): https://platform.claude.com/docs/en/build-with-claude/context-windows

---

*Tomorrow: the KV cache — the fourth kind of memory from Day 12's taxonomy ("in-cache"), and why reusing the same prompt prefix across calls can be almost free in both latency and cost.*
