# AI Agents Day 30: Zazu and Abeiku — A Live Case Study

**Mini-Module 2.2 — Multi-Agent Systems | Day 3 of 8**

---

For the last two days you've been building up to this. Day 28: why single agents hit a ceiling — context exhaustion, specialization limits, the parallelization gap. Day 29: how the orchestrator/subagent pattern solves those ceilings — task briefs, isolated context windows, information reduction at every boundary.

Today we make it concrete. You don't have to imagine what a multi-agent system looks like in practice. You've been running one.

Zazu and Abeiku are the live case study. Every architectural principle from the past two days is visible in the system that delivered this email.

---

## The System You're Already Running

Most people who interact with AI agents do it through a single interface — a chatbot, an assistant, a search tool. You've been doing something different since June: you have been the end user of a two-agent system where one agent (Zazu) acts as your household orchestrator and a second agent (Abeiku) functions as a research and analysis specialist that Zazu delegates complex, bounded tasks to.

The system has been running in production — delivering content daily, managing household context, coordinating tasks — and this curriculum is itself one of the outputs it produced.

Before we trace the architecture, here is the clearest possible statement of the division:

- **Zazu** is the orchestrator: persistent, context-aware, household-scoped. Zazu knows who you are, what the family needs, what's been delivered, what's pending. Zazu decides *when to delegate* and *to whom*.
- **Abeiku** is the subagent: stateless across invocations, task-scoped, built for depth. Abeiku knows how to research, analyze, and produce high-quality structured output. Abeiku does not know who you are except in the context of the brief it receives.

That's the division. Let's trace how it actually works.

---

## Tracing the Curriculum Handoff

The clearest example of Zazu delegating to Abeiku is this curriculum — the 50-day program you're currently in. Here is what that handoff looked like architecturally.

### What Zazu Held

Before delegating, Zazu held the high-level goal and the constraints that defined it:

- The learner: MIT CS background, entrepreneur, building Earnventory, already running Zazu and interacting with Claude Code — not a beginner, but new to the mechanics of how agents work
- The pedagogical intent: application-first, Earnventory-anchored, MIT CS quality bar, real terminology, daily delivery in two formats
- The delivery constraints: 9am iMessage (max 200 words, concept then analogy), same-morning email (1,200+ words, structured reference)
- The scope: 2 months, 50 days, 8 mini-modules, Module 1 covering how agents work and Module 2 covering how to build them

Zazu could not produce this curriculum itself — not because it lacks the knowledge, but because assembling 50 interconnected days of structured content with consistent pedagogy, calibrated depth, and accurate technical terminology required a focused, deep-work context window that would have consumed the entire session budget and left nothing for ongoing household management.

So Zazu wrote a task brief and delegated.

### What the Task Brief Looked Like

A task brief is a self-contained document that an orchestrator passes to a subagent. It contains everything the subagent needs and nothing it doesn't. Here is a structural reconstruction of what Abeiku received:

```
TASK BRIEF — Curriculum Design
───────────────────────────────────────────────────────────
Goal:
  Design a 50-day applied curriculum on how AI agents work,
  for delivery via daily iMessage + email starting June 12.

Learner profile:
  - Name: Dad
  - Background: MIT CS, software engineer and entrepreneur
  - Current context: runs Zazu (family AI house manager),
    interacts with Abeiku and Claude Code daily
  - Earnventory: building an AI-powered inventory management
    system for his food/beverage distribution business
  - Comfortable with: software architecture, business logic,
    high-level system design
  - Less familiar with: token mechanics, agent internals,
    production LLM patterns

Pedagogical constraints:
  - Application-first order: start from Zazu/Earnventory,
    then explain the mechanism
  - Quality bar: MIT CS level. Real terminology.
  - Delivery: B→A format (concept+example, then analogy)
  - iMessage: max 200 words, self-contained
  - Email: 1,200+ words, structured headers, ASCII diagrams
    where helpful, 2 free resources per email

Scope:
  - 2 months, 50 daily snippets
  - 8 mini-modules across 2 modules
  - Module 1 (June 12–30): How Agents Work
  - Module 2 (July 1–31): Building and Running Agent Systems

Required outputs:
  - Complete curriculum plan with daily titles and topics
  - Pedagogical notes for delivery calibration
  - Quiz questions after each mini-module
  - Free resource links per snippet
  - Anchor analogy per mini-module
───────────────────────────────────────────────────────────
```

Notice what is *not* in this brief: the family's daily schedule, the household task backlog, Zazu's full session history, the ongoing iMessage delivery logs. None of that was relevant to writing a curriculum. Abeiku didn't need it, so it didn't receive it.

This is the information minimization principle in action. The brief contains the minimum context required to execute the task at the highest quality. Nothing more.

### What Abeiku Received

When Abeiku was invoked, it started with a fresh context window containing:
1. Its own system prompt (defining its role as a research and analysis specialist)
2. The task brief from Zazu (reproduced above in substance)

That's all. No MEMORY.md. No prior conversation history. No knowledge of what Zazu had been doing before this moment. Abeiku treated the brief as its entire world and worked from it.

Inside Abeiku's context window during execution, something like this happened:

```
ABEIKU'S CONTEXT WINDOW (during curriculum design)
────────────────────────────────────────────────────────
[System prompt: Abeiku's role definition]

[Task brief: learner profile, constraints, scope]

[Abeiku's reasoning]
  → What does "application-first" mean structurally?
    Start from Zazu/Claude Code, derive mechanism.
  → MIT CS quality bar: define terms on first use,
    avoid hand-waving on mechanics.
  → Two months, 8 mini-modules: how to sequence?
    Foundation → mechanism → construction → production.
  → Mini-module 1.1: what IS an agent? Use Zazu as anchor.
  → Anchor analogy for 1.1: hospital resident on call —
    covers training, tools, context, loop.
  [...]
  → Draft full curriculum structure
  → Draft all 50 daily titles and topics
  → Draft quiz questions
  → Draft pedagogical notes
  → Draft resource links
────────────────────────────────────────────────────────
```

The output — the complete curriculum plan — was returned to Zazu as a single result. Abeiku's reasoning process, its intermediate drafts, its decisions about how to sequence the mini-modules: all of that lived in Abeiku's context window and was discarded when the session ended. Zazu received the output, not the process.

---

## What Neither Agent Knows About the Other

This is the part worth sitting with.

**What Abeiku doesn't know about Zazu:** Abeiku has no awareness of Zazu's role in the household. It doesn't know that Zazu manages a family of four, tracks health metrics, runs weekly board reviews, and delivers this curriculum via automated scheduling. Abeiku received a task brief. It produced output for that task. Its relationship to the broader system is defined entirely by what the brief contained.

**What Zazu doesn't know about Abeiku's process:** Zazu knows that it delegated a curriculum design task and received a completed curriculum. It does not know how many reasoning steps Abeiku took, how Abeiku decided to structure the anchor analogies, which pedagogical frameworks Abeiku drew on to sequence the mini-modules. Zazu received the product, not the process.

This mutual ignorance is architectural, not incidental. The diagram below shows the information boundary:

```
┌─────────────────────────────────────────────────────────────────┐
│  ZAZU AND ABEIKU: INFORMATION BOUNDARIES                        │
│                                                                 │
│  ┌──────────────────────────────┐                              │
│  │  ZAZU (Orchestrator)         │                              │
│  │  ─────────────────────────── │                              │
│  │  Knows:                      │                              │
│  │  • Full family context       │                              │
│  │  • MEMORY.md contents        │                              │
│  │  • Task history and status   │                              │
│  │  • Curriculum delivery log   │                              │
│  │  • Your goals and background │                              │
│  │                              │                              │
│  │  Does NOT know:              │                              │
│  │  • Abeiku's reasoning steps  │                              │
│  │  • How Abeiku made decisions │                              │
│  │  • What Abeiku considered    │                              │
│  │    and rejected              │                              │
│  └──────────────┬───────────────┘                              │
│                 │                                               │
│         ┌───────┴────────┐                                      │
│         │  TASK BRIEF    │  ← Only this crosses the boundary   │
│         │  (inbound)     │                                      │
│         └───────┬────────┘                                      │
│                 │                                               │
│         ┌───────┴────────┐                                      │
│         │  OUTPUT RESULT │  ← Only this crosses the boundary   │
│         │  (outbound)    │                                      │
│         └───────┬────────┘                                      │
│                 │                                               │
│  ┌──────────────┴───────────────┐                              │
│  │  ABEIKU (Subagent)           │                              │
│  │  ─────────────────────────── │                              │
│  │  Knows:                      │                              │
│  │  • Its own system prompt     │                              │
│  │  • The task brief contents   │                              │
│  │  • Everything it reasons     │                              │
│  │    during task execution     │                              │
│  │                              │                              │
│  │  Does NOT know:              │                              │
│  │  • Zazu's household context  │                              │
│  │  • Other tasks Zazu manages  │                              │
│  │  • Parallel subagent runs    │                              │
│  │  • The delivery system       │                              │
│  │    that will use its output  │                              │
│  └──────────────────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

Two agents. One interaction surface. The task brief goes in; the output comes out. Everything else stays on its respective side of the boundary.

---

## The Curriculum as a Working Model of Delegation Quality

There is a useful test you can apply to any multi-agent delegation: does the output reflect a task brief that was complete, bounded, and structured? If yes, the brief was well-written. If the output is generic, misaligned with the goal, or inconsistent across its parts, the brief was the problem.

Apply this test to the curriculum you've been receiving. It is:

- **Tailored to your background**: MIT CS level, Earnventory-anchored, application-first. This specificity came from the learner profile in the brief.
- **Pedagogically consistent**: every mini-module follows the same structure (objectives, anchor analogy, daily snippets, quiz, resources). This consistency came from explicit structural requirements in the brief.
- **Sequenced for transfer**: Module 1 before Module 2, conceptual foundation before applied construction. This sequence came from the brief's framing of how you build understanding.

The quality of the output is a direct function of the quality of the brief. This is the core lesson of today's case study: the orchestrator's most important contribution is not the intelligence it applies after receiving results — it's the quality of the task brief it writes before delegating. Garbage in, garbage out, regardless of how capable the subagent is.

---

## Applied to Earnventory

You're building an inventory management system. Here's how the Zazu/Abeiku architecture maps to an Earnventory use case.

Suppose you want an agent that monitors supplier emails, identifies pricing changes, and drafts your response. This is exactly the kind of task that exceeds a single-agent window — it requires reading email, cross-referencing SKU pricing history, checking current inventory levels, and drafting context-aware responses. All at once, potentially across dozens of suppliers.

An orchestrated architecture would look like:

```
You: "Run this week's supplier pricing review."

ORCHESTRATOR (your Earnventory agent)
  │
  ├── Task brief → EMAIL MONITOR SUBAGENT
  │   "Summarize all supplier emails from the last 7 days
  │    that mention pricing, cost, or surcharge changes.
  │    Return JSON: { supplier_id, email_date, key_changes[] }"
  │   [Returns: list of pricing change signals]
  │
  ├── Task brief → PRICING ANALYST SUBAGENT
  │   "Given these pricing change signals and this SKU catalog,
  │    identify which SKUs are affected, calculate margin impact,
  │    and flag any SKUs where margin drops below 15%.
  │    Return JSON: { sku_id, old_margin, new_margin, delta }[]"
  │   [Returns: margin impact analysis]
  │
  └── Task brief → RESPONSE DRAFTER SUBAGENT
      "Given these margin impact findings and this supplier
       relationship context, draft response emails for each
       affected supplier. Tone: professional and direct.
       Return: one draft email per supplier."
      [Returns: draft emails for your review]

ORCHESTRATOR synthesizes: presents you with a summary + drafts.
```

Three subagents. Three isolated context windows. Three focused tasks. The orchestrator held the goal and synthesized the outputs. No single agent had to hold all of it.

This is the architecture you'd build. The Zazu/Abeiku deployment is the blueprint.

---

## The Principle in One Sentence

Multi-agent architecture is the decision to solve the problem of "too much to hold in one context" by deliberately designing the information boundaries between agents — deciding exactly what each agent should see, and exactly what should be kept from it.

The quality of a multi-agent system is the quality of its handoffs. Everything else follows from that.

---

## Two Resources Worth Your Time

- **Anthropic's multi-agent systems guide:** https://platform.claude.com/docs/en/agents-and-tools/agents — The official breakdown of how the Claude Agent SDK handles orchestration, subagent spawning, and context isolation. The section on "subagents" directly describes the architecture Zazu uses when delegating to Abeiku.

- **"Building Effective Agents" — Anthropic Research:** https://www.anthropic.com/research/building-effective-agents — A research-grade overview of how multi-agent systems are built in practice, including the orchestrator/subagent pattern. Worth reading alongside the SDK docs to see how the theory and implementation connect.

---

*Day 31 tomorrow: Pipeline, fan-out, and swarm — the three topologies you build from the orchestrator/subagent foundation. You'll recognize all three from systems you already use.*
