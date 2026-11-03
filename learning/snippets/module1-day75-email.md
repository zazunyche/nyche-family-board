# AI Agents Day 75: Orchestrator and Subagent — The Fundamental Pattern

Yesterday you saw why a single agent hits a wall: context exhaustion, sequential bottlenecks, compounding failure. Today is the architectural response to that wall. The orchestrator/subagent pattern is the foundational unit of every serious multi-agent system — including the one running underneath Zazu right now.

---

## The Core Idea

Multi-agent architecture rests on a single principle: **separate the agent that decides from the agents that execute.**

The **orchestrator** receives the user's goal. It plans, decomposes, delegates, and synthesizes. It does not do the domain work itself.

The **subagents** each receive a narrow task. They execute it. They return a result. They are unaware of the broader goal, unaware of each other, and — critically — unaware of the orchestrator's full context.

That last point is the architectural lever. Isolation isn't a constraint; it's the mechanism that lets multi-agent systems scale past what any single agent can hold.

---

## Anatomy of the Pattern

```
User / Harness
      |
      v
 [ORCHESTRATOR]
  - Receives full goal
  - Holds high-level context
  - Plans decomposition
  - Issues delegations
  - Synthesizes outputs
      |
   ---+---+---+--- ...
   |       |       |
   v       v       v
[SUB-A] [SUB-B] [SUB-C]
 Narrow  Narrow  Narrow
 task    task    task
   |       |       |
   v       v       v
 result  result  result
      \   |   /
       v  v  v
   [ORCHESTRATOR]
   synthesizes → final output
```

Each subagent is its own Claude API call — its own model invocation, its own context window, its own tool access. The orchestrator sends it a prompt (the task briefing) and receives back a text response (the result). That's the whole interface.

---

## What "Isolated Context Window" Actually Means

When Zazu delegates a task to Abeiku, Abeiku does not inherit Zazu's conversation history, memory files, or tool results from prior steps. Abeiku starts fresh. Its context contains exactly what Zazu chose to put in the delegation prompt — nothing more.

This is not a limitation. It is a design guarantee.

Consider the alternative: if subagents shared the orchestrator's context, you'd have every agent fighting for the same finite token budget. A 10-step workflow with shared context would burn 10x the tokens just on state propagation. Worse, each subagent would be distracted by everything the others had done — reasoning contaminated by irrelevant history.

Isolated context windows mean:
- Each subagent holds only what it needs to do its job
- Token usage scales with task complexity, not orchestration depth
- Subagents can run in parallel without racing on shared state
- A subagent failure is contained — it doesn't corrupt the orchestrator's context

The tradeoff: the orchestrator must deliberately decide what information each subagent needs. That decision is the craft of multi-agent system design.

---

## What the Orchestrator Actually Does

The orchestrator has three jobs:

**1. Decompose.** Break the user's goal into sub-tasks that can be executed independently (or in a defined sequence). Good decomposition minimizes the dependencies between sub-tasks — the more a subagent's output depends on another subagent's output, the harder parallelism becomes.

**2. Delegate.** Write the task briefing for each subagent. This is a prompt — a system prompt + user message that tells the subagent exactly what to do, what context it has, what format to return results in, and what tools it has access to. The orchestrator's skill at writing these briefings determines the quality of what comes back.

**3. Synthesize.** Collect the subagent outputs and produce the final result for the user. This often requires reasoning about the outputs — not just stitching text, but interpreting, resolving conflicts, and making the combined result coherent.

The orchestrator never does domain work itself. It is a coordinator, not a specialist.

---

## Applied to Earnventory: Supplier Risk Report

Let's trace the pattern through a concrete use case.

**Goal:** "Generate a risk-ranked report of all active suppliers for our Q4 inventory review."

**Orchestrator's decomposition:**

```
Task: Supplier Risk Report
├── Sub-task A: Email Intelligence
│   Subagent: Read supplier email threads (last 45 days)
│   Output: Per-supplier summary — tone, complaints, delays mentioned
│
├── Sub-task B: Inventory Intelligence  
│   Subagent: Query inventory levels for all active SKUs
│   Output: Per-supplier list of at-risk SKUs (stock < 30-day reorder threshold)
│
└── Sub-task C: Report Synthesis
    Subagent: Receive A and B outputs
    Produce: Risk-ranked supplier list with rationale, top 3 action items
```

**What the orchestrator sends Subagent A:**

> "You are an email intelligence analyst. I will give you a set of supplier email threads from the last 45 days. For each supplier, produce a structured summary: overall tone (positive/neutral/concerning), any mentions of supply disruptions, pricing changes, or delivery delays, and a 1-sentence risk signal. Return results as a JSON array. Here are the threads: [...]"

Subagent A never sees the inventory data. It never knows there's a risk report being assembled. It sees only email threads and a clear output spec.

**What the orchestrator sends Subagent B:**

> "You are an inventory analyst. I will give you current stock levels and reorder thresholds for all active SKUs, organized by supplier. Identify which suppliers have one or more SKUs below their 30-day reorder threshold. Return results as a JSON array of {supplier, at_risk_skus, severity}. Here is the data: [...]"

Subagent B never reads an email. It never sees Subagent A's output. It sees only inventory numbers.

**What the orchestrator sends Subagent C:**

> "You are a supplier risk analyst. I will give you two intelligence summaries: (1) email sentiment analysis per supplier, (2) inventory risk signals per supplier. Your job is to produce a risk-ranked report suitable for a Q4 inventory review. Rank suppliers from highest to lowest risk, write a 2-3 sentence rationale for each, and end with 3 concrete action items. Here are the inputs: [summary from A] [summary from B]"

Subagent C never reads raw emails. It never queries inventory directly. It reasons from pre-digested inputs.

The orchestrator stitches C's output into the final report, adds a header, and delivers to the user.

---

## Trust and Verification: The Quiet Risk

There is a problem built into this pattern that most teams don't notice until production.

The orchestrator, by default, trusts what subagents return. If Subagent A misreads email tone and classifies a concerning thread as positive, that error propagates into C's report without correction. The orchestrator synthesizes bad inputs into a confident wrong answer.

This is the **trust chain problem** in multi-agent systems. A chain is only as reliable as its weakest link — and unlike human specialists who might push back on a bad brief, subagents just execute.

Mitigations:
- Have the orchestrator do a light sanity check on subagent outputs before passing them downstream ("does this output match the format and quantity I asked for?")
- Use deterministic validation where possible (JSON schema checks, count checks, range checks) rather than trusting the model to self-verify
- For high-stakes outputs (anything that triggers a financial action), add a human-in-the-loop review step before the orchestrator synthesizes
- Separate subagents for reasoning and for verification — one subagent writes, another critiques

You already practice this instinctively in Earnventory: you don't auto-submit purchase orders. The draft-first, human-confirms model is a trust verification step baked into the tool design. The same principle applies at the multi-agent level.

---

## The Orchestrator's Real Job: Writing Good Briefings

The most common point of failure in orchestrator/subagent systems isn't the architecture — it's the briefings. An orchestrator that hands Subagent A a vague task gets a vague result. The garbage-in rule applies with extra force here, because vague subagent output becomes the input to the next subagent.

A good briefing has four elements:

1. **Role** — who the subagent is ("you are an inventory analyst")
2. **Task** — exactly what to do, stated precisely
3. **Output format** — what structure to return, down to field names if the output feeds downstream code
4. **Context** — the minimum set of data the subagent needs, no more

That last item is where the orchestrator's judgment matters most. Giving Subagent C the raw emails instead of Subagent A's summary isn't "more data, better answer" — it's extra tokens, distracted reasoning, and a bigger context window bill. The orchestrator decides the minimum viable handoff.

---

## How This Shows Up in Zazu

When you ask Zazu to do something research-heavy — "summarize the last week of family activity" or "draft a birthday message based on what you know about Kwame" — Zazu may delegate parts of that to a subagent rather than doing everything in one context. You don't see the delegation; you see the result. But the pattern is the same: Zazu holds the goal and context, the subagent holds the narrow task, and the outputs get stitched together before you read them.

The reason the architecture exists isn't to make things complicated. It's so that Zazu can handle tasks that are genuinely too large, too parallel, or too specialized for a single reasoning pass.

---

## What to Watch For Tomorrow

Tomorrow we look at what actually travels in a handoff — the exact information that moves from the orchestrator to a subagent (and what doesn't). The minimum viable handoff principle has more engineering content than it looks like on first read: it's about token efficiency, security isolation, and avoiding the distraction problem simultaneously.

---

## Free Resources

- **Anthropic's multi-agent systems guide** — the canonical reference for how Claude agents orchestrate subagents, including trust levels, context isolation, and tool scoping: https://platform.claude.com/docs/en/agents-and-tools/agents

- **"Multi-Agent Orchestration: 5 Patterns That Work"** — practical patterns for orchestration, including the orchestrator/subagent structure, fan-out, pipeline, and when to combine them: https://www.digitalapplied.com/blog/multi-agent-orchestration-5-patterns-that-work
