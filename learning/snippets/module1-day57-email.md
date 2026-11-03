# AI Agents Day 57: Memory and Planning — A Unified Picture of How Zazu Thinks Across Time

**Mini-Module 1.3/1.4 Extended — Context, Memory, and Reasoning | Day 57 of the Nyche AI Curriculum**

---

## What We're Covering Today

You've now seen the four types of agent memory: in-weights (baked into training), in-context (the live whiteboard), external/RAG (the filing cabinet), and in-cache (the computation shortcut). You've also seen how agents reason: chain-of-thought, ReAct, extended thinking, and the upfront-planning vs. reactive-replanning tradeoff.

Today those two threads meet. The synthesis question is: **how does what an agent remembers determine what it can plan — and vice versa?**

This is not an abstract question. It determines whether Zazu's morning briefing actually accounts for the context you care about, or whether an Earnventory agent makes a purchase-order decision based on dangerously incomplete information. Getting it right is an engineering discipline, not an accident.

---

## The Fundamental Constraint: You Can Only Plan What's on the Whiteboard

Here's the thing that ties everything together: **the model can only reason about what's currently in its context window.**

Not what it "knows" in some abstract sense. Not what exists in MEMORY.md on disk. Not what was established in a previous conversation. Only what's written on the whiteboard right now.

This sounds obvious once stated, but it has sharp practical implications:

- External memory doesn't help unless it's been loaded into context before the planning begins.
- In-weights knowledge about the world is always available — but it's static, potentially outdated, and can't be updated at inference time.
- KV cache doesn't change what's in context; it just makes re-reading the same content faster.
- Compaction (the mid-session janitor) decides what survives from earlier in the conversation — and what it drops can silently invalidate a plan the agent thought it had made.

The context window is not just a constraint on message length. It's the **planning budget** — the complete set of information available for any reasoning the model does in a given turn.

---

## The Four Memory Types as Four Input Channels to Planning

Think of every planning decision the agent makes as drawing from four distinct input channels simultaneously. Here's what each channel contributes — and what happens when it fails.

### Channel 1: In-Weights (Training Knowledge)

**What it contributes:** Facts, patterns, language, world models, and domain knowledge baked in during training. Zazu knows what a purchase order is. Zazu knows how email threads work. Zazu knows that "invoice" usually implies payment is due. None of this needed to be written in the system prompt.

**Failure mode:** In-weights knowledge is frozen at training time. If your company's pricing model changed after the training cutoff, the model doesn't know. If a supplier changed names, the model may use the old one. Anything time-sensitive or domain-specific that wasn't in the training corpus must be provided through another channel.

**For Earnventory:** You cannot rely on in-weights knowledge for anything that's specific to your business — your SKU catalog, your supplier relationships, your margin targets, your approval workflows. Those must come from context or external retrieval.

### Channel 2: External Memory (Session-Start Loading)

**What it contributes:** Persistent facts that survive across sessions. In Zazu's case, this is MEMORY.md — loaded at the beginning of every conversation. Family names, preferences, recurring commitments, notes from previous conversations that were explicitly saved.

**The loading moment matters.** External memory doesn't passively flow into context — something has to explicitly retrieve it and place it on the whiteboard. In Zazu's architecture, this happens at session initialization. The system prompt (or a hook that runs at startup) reads the relevant memory files and injects them. By the time the first user message arrives, that content is already in context.

**Failure mode:** If the memory file isn't loaded, or if what's loaded is stale, the agent plans against an incorrect picture of the world. Zazu not loading MEMORY.md would mean it doesn't know Dad has an MIT CS background — and might explain token prediction at a level that's condescending rather than challenging.

**For Earnventory:** This is where you'd load supplier profiles, active contracts, current pricing agreements, and any context that needs to be available before the first user input. Think of it as the agent's briefing folder — assembled before the meeting starts.

### Channel 3: In-Context (Live Conversation)

**What it contributes:** Everything added during the current session: user messages, agent responses, tool calls and their results, intermediate reasoning. This is the whiteboard being actively written.

**This channel is dynamic.** As the conversation progresses, new information gets added. The agent's understanding of what to do next is shaped by everything that's accumulated so far. This is why early-conversation context matters: what gets established in the first few turns constrains (and enables) what the agent can plan in later turns.

**Failure mode:** As context grows, two things can happen. First, older content can get effectively "pushed back" — not compacted out yet, but so far from the current token position that the model pays less attention to it (attention in transformers is not uniform across all positions). Second, and more critically, compaction eventually removes older content entirely and replaces it with a summary. That summary may not capture every constraint the agent was working under.

**For Earnventory:** A multi-step workflow that runs for 50+ turns is at risk of losing early-conversation constraints through compaction. If turn 3 established "only send purchase orders for amounts under $10,000 without approval," and that constraint gets dropped from the summary at turn 35, the agent in turn 40 may act as if that constraint doesn't exist.

### Channel 4: In-Cache (KV Cache)

**What it contributes:** Not new information — computation speed. When the same content (like a long system prompt) appears at the start of every conversation, the attention computations for those tokens are cached and reused rather than recomputed. This reduces latency and cost for repeated prefixes.

**Failure mode:** Cache misses. If the system prompt changes slightly (even whitespace), the cache is invalidated and the full computation reruns. In high-volume production systems, unexpected cache invalidation can meaningfully increase latency and cost.

**For Earnventory:** If your Earnventory agent has a long, stable system prompt (say, with your full supplier catalog), caching it means the first tool call happens faster on every subsequent request. Structure your prompts so the stable content (role, capabilities, static rules) comes first and variable content (user context, dynamic data) comes at the end — that maximizes cache hit rate.

---

## How Planning Draws on All Four Channels

Here's a concrete trace of Zazu handling a real task — Dad's morning briefing — with each memory channel labeled:

```
SESSION START:
  [KV cache]    → System prompt loaded (Zazu's identity, permissions, date)
  [External]    → MEMORY.md loaded: Dad is MIT CS, building Earnventory,
                  prefers brief summaries, interested in AI learning

USER MESSAGE: "Good morning. What's on for today?"

TURN 1 — PLANNING:
  [In-weights]  → Knows "good morning" signals a daily briefing request
  [In-weights]  → Knows how to call calendar and email tools
  [External]    → Knows Dad's timezone, family members to watch for,
                  known recurring commitments
  [In-context]  → Sees it's 9:04am on a Tuesday (from system context)

  Plan formed: check calendar, check email, check any pending Zazu tasks

TURN 1 — EXECUTION (ReAct):
  Reason: "Check calendar first — that sets the day's structure"
  Act:    get_calendar_events(date=today)
  Observe: Board meeting at 2pm, school pickup at 4pm

  Reason: "School pickup constrains the afternoon. Note this."
  [In-context now includes: board meeting 2pm, pickup 4pm]

TURN 2 — EXECUTION:
  Reason: "Now email — filter for unread, high-priority"
  Act:    search_email(query="unread", filter="important")
  Observe: 3 unread — two suppliers, one from Abeiku

  Reason: "Two suppliers might be Earnventory-relevant.
           Abeiku message may be curriculum-related."
  [External memory about Earnventory lets Zazu recognize supplier emails
   as potentially important — in-weights alone wouldn't know this context]

FINAL SYNTHESIS:
  All four channels contribute to the briefing that gets written.
  Remove any one and something is missing or wrong.
```

---

## The Design Principle: Memory Architecture = Planning Capability

Here's the key insight of the day: **the information architecture of your agent's memory system directly determines the quality ceiling of every plan it can make.**

You can have the most capable model in the world — best reasoning, best chain-of-thought, deepest extended thinking scratchpad. It still cannot plan around information that isn't in its context window at planning time.

This is why **context engineering** (Day 56 of this curriculum) is the central engineering discipline for production agents — not prompt engineering, not model selection. Those matter, but they're bounded by what's on the whiteboard.

Designing an agent's memory means answering three questions before any code is written:

1. **What does the agent need to know that's true at session start?** → Design the external memory loading pipeline.
2. **What does the agent need to know that emerges during execution?** → Design the in-context accumulation and compaction strategy.
3. **What constraints must survive the entire session, even if compaction runs?** → Design those constraints to appear in the system prompt, not just the conversation history.

---

## The Compaction Problem, Revisited

Day 51 introduced compaction. Here's the planning-specific angle: compaction doesn't just lose detail — it can lose **constraints**.

A constraint that appears deep in conversation history and gets summarized as "discussed some task parameters" is no longer operative. The model's next plan will be made without it.

The defensive design pattern:

```
FRAGILE: State the constraint once, early in conversation
  → At risk of compaction after enough turns

ROBUST: State the constraint in the system prompt
  → Lives in the portion of context that compaction preserves
  → Reinforced at every session start

ALSO ROBUST: Re-state the constraint in the summary template
  → Design your compaction prompt to explicitly preserve
     key constraints in any summary it generates
```

For Earnventory, any constraint on agent behavior that has financial or operational consequences — spending limits, approval thresholds, supplier-specific rules — belongs in the system prompt, not in a user message that might get summarized away.

---

## What This Means for Earnventory Agent Design

Putting it together as a design checklist:

**Before the first agent turn:**
- Load supplier profiles, pricing agreements, and approval workflows into context (external memory, loaded at session start)
- Put permanent constraints (spending limits, escalation rules, required confirmations) in the system prompt, not the user message
- Structure the system prompt so stable content precedes variable content (maximize KV cache hit rate)

**During the agent's execution:**
- Use chain-of-thought or extended thinking to make planning decisions explicit and traceable
- Design stopping conditions for reactive loops — the agent needs to know when it's done
- For multi-phase workflows, encode phase boundaries in the system prompt so compaction can't erase them

**At the end of long sessions:**
- If the agent produces a decision (a purchase order, a supplier recommendation), log the full context that led to that decision, not just the output — you need to know what was on the whiteboard when the decision was made
- Any constraint that must survive to the next session needs to be written to external memory (MEMORY.md or equivalent) before the session ends

---

## The Full Picture

```
TIME SCALE        MEMORY TYPE       PLANNING ROLE
───────────────────────────────────────────────────────
Months/years      In-weights        Background world knowledge;
(training)                          domain language; general reasoning

Hours/days        External/MEMORY   Business context; family context;
(before session)                    persistent facts; long-term state

Minutes           In-context        Live task state; tool results;
(during session)  (+ compaction)    conversation history; emerging constraints

Milliseconds      KV cache          Computation speed for stable prefixes;
(per turn)                          no new information, just efficiency
───────────────────────────────────────────────────────
```

All four layers are always active. Planning draws on all four. The whiteboard contains all four layers' contributions at any given moment — and the whiteboard is all the model can see.

That's the unified picture. Memory and planning aren't separate topics. Memory is what makes planning possible. Planning is what memory exists to enable.

---

## Summary

- The context window is the planning budget — the model can only reason about what's currently in it
- All four memory types (in-weights, external, in-context, in-cache) contribute to what's on the whiteboard at planning time
- External memory must be loaded before planning begins; constraints must be in the system prompt to survive compaction
- Designing an agent's memory architecture is designing the quality ceiling of every plan it can make
- For Earnventory: permanent constraints in system prompt, business context in session-start loading, operational limits nowhere near conversation history

---

## Free Resources

- **Anthropic's guide to long context and memory in agents**: https://docs.anthropic.com/en/docs/build-with-claude/agents — particularly the section on context management in long-horizon tasks, which covers compaction strategies and constraint preservation.

- **"Context Engineering: The Key Skill for AI Agents"** (Mem0 blog): https://mem0.ai/blog/context-engineering-ai-agents-guide — practical guide to the discipline of managing what goes into context, with concrete patterns for loading, compression, and retention.

---

*Tomorrow: Wrapping up — what you now know about agents that most developers don't.*
