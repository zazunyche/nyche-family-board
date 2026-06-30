# AI Agents Day 14: Context Engineering Is the New Prompt Engineering
**Why Managing What the Model Sees Is Now a First-Class Engineering Discipline**

*Module 1.3, Day 14 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 30, 2026*

---

## The Short Version

Prompt engineering is the craft of wording a single instruction well. Context engineering is the broader discipline of curating *everything* that ends up in the model's context window across a multi-turn, multi-tool agent run — system prompt, retrieved documents, tool definitions, conversation history, and prior tool results. As agents take more turns and call more tools, the context window fills with accumulated noise faster than it fills with signal. Four techniques keep it under control: **compression** (shrink without losing meaning), **summarization** (replace raw history with distilled takeaways), **just-in-time retrieval** (pull in only what's needed, only when it's needed), and **isolation** (delegate a sub-task to a fresh context instead of polluting the main one). Get this wrong and you get "context rot" — a window that's technically not full, but so cluttered that the model's attention degrades anyway.

---

## Why This Follows Naturally From the Last Three Days

You've now covered the whole memory stack: the context window is finite RAM (Day 11), agents draw on four distinct memory types (Day 12), and RAG is the mechanism for pulling external data into context on demand (Day 13). Each of those days answered a "what is it" question. Today answers a "who's in charge of it" question.

Because here's the thing nobody decides for you automatically: every tool call result, every retrieved document, every turn of conversation history is a *candidate* for inclusion in the next model call — and someone has to decide whether it stays, gets compressed, gets summarized, or gets dropped. That someone is the agent's context engineering logic. It's not optional. If you don't design it deliberately, it happens accidentally — and accidentally is how context windows fill with stale tool outputs nobody needed twice.

---

## From Prompt Engineering to Context Engineering

A few years ago, "prompt engineering" meant: write a good system prompt, phrase the user's question clearly, maybe add a few-shot example. That's still useful — but it assumes a single, mostly-static prompt sent once.

Agents break that assumption. A single agentic task might involve:

```
ONE EARNVENTORY TASK, MANY CONTEXT-SHAPING DECISIONS
═══════════════════════════════════════════════════════════════
Turn 1: User asks "evaluate this purchase order"
Turn 2: Agent calls get_supplier_pricing → 800-token result
Turn 3: Agent calls get_margin_rules → 1,200-token result
Turn 4: Agent calls check_inventory_level → 400-token result
Turn 5: Agent reasons over all three results, asks a follow-up
Turn 6: User answers; agent calls send_email_draft
Turn 7: ...continues for 15 more turns
═══════════════════════════════════════════════════════════════
```

By turn 20, if every tool result from every turn is still sitting in context verbatim, you've burned tens of thousands of tokens on intermediate results the model no longer needs to see in full — it needs the *conclusion* it drew from them, not the raw payload. Context engineering is the discipline of catching that before it happens.

This is a genuinely different skill from prompt wording. Prompt engineering optimizes a sentence. Context engineering optimizes a *system* — the rules governing what enters context, what leaves it, and in what form.

---

## The Four Levers

**1. Compress**

Shrink content without losing the information the model actually needs. A 1,200-token API response might contain 200 tokens of signal and 1,000 tokens of formatting, metadata, and fields nobody asked about. Compression means extracting the 200 tokens before they ever enter context — not asking the model to mentally filter noise on every turn.

**2. Summarize**

Replace raw history with a distilled version once it's no longer being actively reasoned over. After the agent has used a tool result to draw a conclusion, the conclusion can often replace the raw result: "Supplier A's Tier 2 pricing applies; order qualifies" can stand in for the 800-token pricing document that produced it. This is also how long conversations survive: older turns get summarized into a running synopsis instead of carried verbatim forever — the same mechanism that compacts your own conversations with Zazu.

**3. Retrieve Just-in-Time**

Don't pre-load everything that *might* be relevant — pull in exactly what's needed for the current step, when it's needed. This is RAG applied as a context-management strategy, not just a memory strategy: instead of stuffing the full product catalog into the system prompt "just in case," retrieve the three SKUs relevant to this specific purchase order, right before they're needed.

**4. Isolate**

Hand a self-contained sub-task to a fresh context window instead of doing it inline. If part of a task requires reading through 50 pages of a supplier contract to extract one clause, that reading doesn't need to happen in the main agent's context — a subagent can do it in its own isolated window and return just the clause. (This is the mechanism behind Zazu delegating to Abeiku, which Mini-Module 2.2 covers in depth next month.)

```
THE CONTEXT ENGINEERING TOOLKIT
═══════════════════════════════════════════════════════════════
              Raw input                Context-engineered
─────────────────────────────────────────────────────────────
COMPRESS      1,200-token API reply →  200-token extracted fact
SUMMARIZE     40 turns of history   →  1 running synopsis
RETRIEVE      Full product catalog  →  3 relevant SKUs, on demand
ISOLATE       50-page contract read →  1 extracted clause,
              done inline                done in a subagent
═══════════════════════════════════════════════════════════════
```

---

## Context Rot: The Failure Mode This Prevents

It's tempting to think "the context window is 200K tokens, I have plenty of room" — but room isn't the only constraint. Research on long-context model behavior consistently shows that models perform worse on needle-in-a-haystack-style tasks as irrelevant content accumulates, even well below the hard token limit. This is sometimes called **context rot**: the window isn't full, but it's so cluttered with low-signal content that the model's attention gets diluted across noise, and it becomes more likely to miss the one fact that actually mattered.

This is the same "lost in the middle" effect from Day 13's RAG discussion, but generalized: it's not just about retrieved documents — it applies to accumulated tool results, redundant conversation history, and verbose intermediate reasoning that never got cleaned up.

The practical consequence: a well-engineered agent with a *smaller*, *cleaner* context window will often outperform one with a larger window stuffed full of unfiltered history. More context is not strictly better. Better-curated context is better.

---

## Earnventory Example: A Long Supplier Negotiation

Imagine an Earnventory agent handling a purchase-order negotiation with a supplier that runs 60 messages back and forth over two weeks — counter-offers, clarifying questions, revised quantities, shipping terms.

Without context engineering, by message 40 the agent's context contains all 40 raw messages, every intermediate price calculation, and every tool call result along the way. It's slow, expensive, and increasingly unreliable as the relevant facts get buried.

With context engineering applied:

```
NEGOTIATION CONTEXT, ENGINEERED
═══════════════════════════════════════════════════════════════
KEPT VERBATIM (in-context, active):
  - Last 3 messages (current negotiation state)
  - Current counter-offer terms

SUMMARIZED (replaces raw history):
  - "Negotiation summary: started at $48/unit, supplier
     countered $46, we held at $45 citing Tier 2 contract
     terms, awaiting response."

RETRIEVED JUST-IN-TIME (pulled in only when needed):
  - Supplier A's contract terms (only when pricing is
     actually being discussed this turn)

ISOLATED (handled by a subagent, result returned only):
  - "Check whether this supplier has missed SLA deadlines
     in the last 6 months" → subagent reads invoice history,
     returns one sentence
═══════════════════════════════════════════════════════════════
```

The agent at message 60 has roughly the same context size as it did at message 10 — because the architecture is actively managing what stays.

---

## What's Next in Mini-Module 1.3

- **Day 15 (final day of this mini-module):** How Zazu's own memory system works — MEMORY.md, session context, what persists across conversations and what doesn't, and why those boundaries were deliberate design choices rather than limitations.
- **Quiz for Mini-Module 1.3** arrives the morning after, covering context windows, the four memory types, RAG, and context engineering together.

---

## Free Resources

1. **"Effective Context Engineering for AI Agents" — Anthropic Engineering Blog**
   Anthropic's own writeup on context engineering as a discipline distinct from prompt engineering — covers compaction, just-in-time retrieval, and sub-agent isolation as production techniques. The most directly relevant resource for today's topic.
   https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

2. **Mem0's Context Engineering Guide**
   Practical, vendor-neutral coverage of the same territory — compression, summarization, and retrieval strategies for agents that run long. Good complement to Anthropic's more architecture-focused piece.
   https://mem0.ai/blog/context-engineering-ai-agents-guide

---

## One Sentence to Carry Forward

Context engineering is the discipline of deciding, on every single turn, what stays in the model's context verbatim, what gets compressed or summarized, what gets retrieved just-in-time instead of pre-loaded, and what gets delegated to an isolated context entirely — because past a certain point, a cluttered context window hurts an agent more than a small one ever could.

---

*Day 14 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.3: Context, Memory, and State — Day 4 of 5*
