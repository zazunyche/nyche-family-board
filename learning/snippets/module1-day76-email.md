# AI Agents Day 76: Zazu and Abeiku — A Live Case Study in Multi-Agent Architecture

Yesterday's pattern was abstract: orchestrator directs, subagents execute, isolation is the mechanism. Today we make it concrete by tracing the architecture of the system you've been running for months.

Zazu and Abeiku are a live multi-agent deployment. You've seen both agents in action. Today we dissect exactly how they relate architecturally — what each agent receives, what it never sees, what crosses the boundary between them, and what design choices shaped the system.

---

## The Cast of Agents

**Zazu** is the orchestrator. Its job:
- Receiving your requests and holding family context (MEMORY.md, session state, loaded memories)
- Deciding when a task falls within its own scope vs. when to delegate
- Composing delegation briefs for subagents
- Synthesizing results back into a coherent response to you

**Abeiku** is a purpose-specific subagent: extended research and deep analysis. Its job:
- Receiving a scoped task from Zazu (or directly from you, routed through Zazu)
- Working independently within its own isolated context window
- Returning a finished deliverable

The persona distinction matters. Abeiku isn't just Claude with a slightly different system prompt — it's a purpose-configured agent with different behavioral tuning, a different tool set, and a different operational context than Zazu's household-manager role. Same underlying model; different agent entirely.

---

## The Delegation Moment

When Zazu decides to delegate, here is what actually happens:

```
Your message to Zazu:
"Have Abeiku research and write an AI curriculum for Dad."

Zazu's process:
  1. Classify intent: extended research + structured long-form writing → Abeiku
  2. Compose delegation brief:
       - Subject domain: AI agents
       - Learner profile: MIT CS, entrepreneur, building Earnventory,
         familiar with Zazu/Abeiku/Claude Code
       - Format: iMessage (≤200 words) + email (1,200+ words) per day
       - Duration: 50 days, 8 mini-modules
       - Pedagogical approach: application-first (Zazu, Earnventory as examples)
       - Quality bar: MIT CS level, real terminology on first use
  3. Spawn Abeiku with that brief as its starting context
  4. Wait for result
  5. Receive the curriculum as output
  6. Respond to you with confirmation

Abeiku's starting context:
  - Its own system prompt (research-agent identity, tools, behavior rules)
  - Zazu's delegation brief
  - Nothing else
```

Notice what is absent from Abeiku's starting context:
- Zazu's MEMORY.md
- Your conversation history with Zazu
- Other open tasks in Zazu's queue
- Family schedules, financial state, unread emails

That's not an oversight. It's the design. Abeiku gets exactly what it needs to do the job, and nothing that would expand its context unnecessarily or expose information irrelevant to the task.

---

## Why Isolation Is the Mechanism, Not a Limitation

Consider what would happen if Abeiku received Zazu's full context:

**Context budget collapse.** Zazu's active context at any moment includes system prompt, loaded memory files, conversation history, and tool results — potentially 40,000–80,000 tokens. Giving all of that to Abeiku means it starts every research task with most of its context window already occupied by household data that has nothing to do with the job.

**Attention dilution.** Transformer attention is not equally distributed — the model weighs everything in context. A large body of irrelevant information degrades the quality of attention paid to the task-relevant parts. Abeiku's research depth would degrade as Zazu's context grows, even if the task brief itself is unchanged.

**Error containment.** If Abeiku can read sensitive family information and that information gets reflected back in an output (or leaked via a prompt injection through a tool result), isolation is broken. Keeping the boundary sharp contains the blast radius of any mistake.

The tradeoff: Abeiku lacks the full picture. Zazu must include the essential context in the delegation brief itself. That's the discipline the orchestrator must apply — **minimum viable handoff**: enough for the subagent to succeed, nothing beyond that.

---

## The Handoff: In and Out

A handoff has two phases: delegation (Zazu → Abeiku) and return (Abeiku → Zazu).

**Delegation brief for the curriculum task:**
```
Essentials included:
  - Task scope and deliverable definition
  - Learner profile (who this is for, what they already know)
  - Format specification (iMessage vs. email, word counts, structure)
  - Pedagogical constraints (application-first, no jargon without definition)
  - Quality bar (MIT CS level, real terminology)

Not included:
  - Today's household schedule
  - Unread emails
  - Zazu's identity rules and behavior configuration
  - Family MEMORY.md
  - Any other open Zazu tasks
```

**Return: what Abeiku delivers back:**

The complete curriculum document — one structured artifact. Not raw research notes, not intermediate reasoning, not a list of sources consulted. Just the finished deliverable Zazu needs to install the program into the learning system.

This is minimum viable handoff in the outbound direction as well. Abeiku's internal context — all the reasoning, iteration, and intermediate work it did — never crosses the boundary. What crosses: one brief in, one deliverable out.

---

## The Architectural Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                             ZAZU                                 │
│  System prompt: family manager identity + tools + behavior rules │
│  Context: MEMORY.md, conversation history, session state         │
│                                                                  │
│  composes delegation brief ──────────────────────►              │
└─────────────────────────────────────────────────────────────────┘
                                                    │
                               ┌────────────────────▼──────────────────────┐
                               │                  ABEIKU                    │
                               │  System prompt: research-agent identity    │
                               │  Context: delegation brief + own tools     │
                               │                                            │
                               │  Loop: Sense → Plan → Act → Observe        │
                               │  (uses its own tools: search, read, write) │
                               │                                            │
                               │  ◄── finished deliverable                  │
                               └────────────────────┬──────────────────────┘
                                                    │
┌───────────────────────────────────────────────────▼─────────────────────┐
│  Zazu receives result, synthesizes into its own context, responds to you │
│  Abeiku's context window: closed — not retained                          │
└─────────────────────────────────────────────────────────────────────────┘
```

The boundary is sharp. No shared state persists between agents. No persistent connection. Abeiku's context window opens for the task and closes when it's done. The orchestrator (Zazu) holds the conversation thread; the subagent (Abeiku) holds only the task.

---

## Design Choices Worth Examining

**Why two separate personas?** Zazu is tuned for conversational responsiveness: brief, action-oriented, household-aware. Abeiku is tuned for extended analytical work: structured output, depth, citation. A single agent trying to do both would be mediocre at both — too verbose for household management, too terse for deep research. Persona specialization is how you extract better per-task performance from the same underlying model.

**Why doesn't Abeiku know it's being orchestrated by Zazu?** It doesn't need to. The task is self-contained. This design choice — subagents unaware of the larger orchestration — also makes Abeiku composable: it can be invoked directly (by you, or by a different orchestrator) without modification. Composability is an architectural property, not an accident.

**Why doesn't Zazu validate Abeiku's output before acting on it?** For a curriculum-writing task, the consequence of an error is low — a bad lesson, easily corrected. For a task with irreversible consequences — "execute a purchase order," "send an email to a supplier" — the orchestrator needs validation logic before acting on a subagent's result. Trust calibration is proportional to consequence. The architecture that works for curriculum writing is insufficient for Earnventory's financial workflows.

---

## The Earnventory Parallel

You'll build something structurally identical for Earnventory. An orchestrator receives the goal: "produce a weekly supplier health report." It composes three delegation briefs and spawns three subagents:

```
Orchestrator: Supplier Health Report Agent
  │
  ├── Subagent A: Email Parser
  │     Brief: "Summarize all supplier emails from the last 7 days.
  │             Identify: price changes, shipment delays, new terms."
  │     Returns: structured summary of supplier comms
  │
  ├── Subagent B: Inventory Checker
  │     Brief: "For each active supplier, pull current inventory levels
  │             and flag any SKUs below reorder threshold."
  │     Returns: per-supplier inventory status
  │
  └── Subagent C: Report Writer
        Brief: "Given [email summary] and [inventory status], write
                a 2-page supplier health report for executive review."
        Returns: finished report
```

Subagent C never reads raw emails. It receives a distilled summary. Subagent A never runs inventory queries. Each agent holds a focused slice. The orchestrator coordinates, synthesizes, and owns the result.

The curriculum you're working through right now was built by this exact pattern. You're learning about the architecture that produced the material you're learning from.

---

## What This Tells You About Agentic System Design

The Zazu/Abeiku architecture illustrates three principles that generalize to any multi-agent system:

1. **Decompose by specialization, not just by load.** Splitting work across agents isn't primarily about parallelism — it's about matching the agent's configuration (identity, tools, tone, context budget) to the nature of the work.

2. **The handoff is the interface.** In software, you think carefully about function signatures and API contracts. In multi-agent systems, the delegation brief is the interface. Vague briefs produce vague outputs. Overly detailed briefs bloat subagent context unnecessarily. Crafting the brief is the orchestrator's core engineering discipline.

3. **Isolation is not a constraint — it's a design primitive.** You don't give subagents less context because you're trying to save tokens. You give them less context because a focused context produces better work, contains errors, and keeps the system composable.

---

## Free Resources

- **Anthropic's multi-agent systems guide:** https://docs.anthropic.com/en/docs/agents-and-tools/agents
- **"Building effective agents" (Anthropic research):** https://www.anthropic.com/research/building-effective-agents

---

Tomorrow: pipeline, fan-out, and swarm — three distinct topologies for wiring agents together, and a concrete framework for deciding which to use when.
