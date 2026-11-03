# AI Agents Day 28: Why One Agent Isn't Enough

**Mini-Module 2.2 — Multi-Agent Systems | Day 1 of 8**

---

Yesterday you closed out Mini-Module 2.1 with a complete Earnventory tool manifest: six read tools, three internal-write tools, and a locked panel of human-only capabilities. You've seen how a single agent with a well-designed tool set can do meaningful analytical work — pulling stock levels, computing days of supply, staging draft purchase orders, escalating to humans before any irreversible commitment.

That architecture is solid. And it has a ceiling.

Today's question is: where does single-agent architecture break down, and why does multi-agent architecture exist? This is the premise of the entire mini-module, so it's worth getting the motivation right before we dive into patterns, protocols, and case studies.

---

## Three Ceilings Single-Agent Systems Hit

### Ceiling 1: Context Window Exhaustion

The context window — the finite "whiteboard" you learned about in Mini-Module 1.3 — is the primary engineering constraint in every agent system. For Claude Sonnet 4, that window is 200,000 tokens. That sounds large until you work through a realistic production scenario.

Imagine you want an Earnventory agent to run a weekly supply chain review:

1. Read all supplier emails from the last 14 days (47 emails, averaging 800 tokens each = 37,600 tokens)
2. Pull current inventory and reorder thresholds for all 120 active SKUs
3. Retrieve the last 3 purchase orders per supplier for pricing comparison
4. Check current exchange rates for 6 international suppliers
5. Cross-reference the above, identify risks, and draft a prioritized action list

Before the agent writes a single word of its output, it has consumed the equivalent of a short novel in context. Add the conversation history, system prompt, tool definitions, and intermediate reasoning — and you're approaching or exceeding the window limit before the synthesis step begins.

When the context window fills, you face a trilemma: truncate early messages (losing critical context), summarize aggressively (losing precision), or error out entirely. None of these is acceptable for a business-critical workflow.

The multi-agent solution: decompose the task so each agent operates on a bounded, relevant slice of the data, with a fresh context window, and an orchestrator receives only their synthesized outputs.

### Ceiling 2: The Specialization Benefit

Some tasks are not primarily a volume problem — they're a focus problem.

Consider the reasoning modes required in that weekly review:

- **Numerical analysis:** Computing margin impact, days of stock, reorder quantities — this benefits from systematic, step-by-step arithmetic reasoning with clear intermediate states
- **Contextual judgment:** Evaluating which suppliers are reliable partners worth prioritizing — this benefits from qualitative pattern recognition across relationship history
- **Prose generation:** Drafting an action summary or supplier communication — this benefits from a completely different mode: tone calibration, appropriate formality, concise framing

A single agent with a general system prompt ("You are an Earnventory supply chain agent") must context-switch between all three simultaneously while also tracking the state of a long multi-step task. An agent focused on one mode — with a system prompt written specifically for that mode — consistently produces more reliable output.

This is not a limitation of intelligence. Claude is capable of doing all three. It's an architectural reliability observation: a focused agent produces more auditable, more consistent results than a general agent juggling multiple cognitive modes across a long session.

### Ceiling 3: Sequential Execution vs. Parallelization

The most immediately quantifiable benefit of multi-agent architecture is parallelization.

A single-agent system executes tool calls one at a time (with limited exceptions for parallel tool calls within a single turn, which you learned about in Day 25). When your weekly supply chain review requires checking 10 suppliers:

```
SINGLE AGENT — SEQUENTIAL
─────────────────────────────────────────────────────
[Agent] → check Supplier A → wait → check Supplier B → wait → ... → check Supplier J → wait → synthesize

Total time: 10 × (tool call latency + processing time)
```

Ten subagents dispatched in parallel by an orchestrator:

```
MULTI-AGENT — PARALLEL
─────────────────────────────────────────────────────
                    ┌──> [Subagent A] → check A ──┐
                    ├──> [Subagent B] → check B ──┤
[Orchestrator] ────>├──> [Subagent C] → check C ──┼──> collect results → synthesize
                    ├──> ...                       │
                    └──> [Subagent J] → check J ──┘

Total time: 1 × (tool call latency + processing time) + synthesis overhead
```

For a 10-supplier check, the wall-clock speedup approaches 10x. For a daily inventory health check that runs every morning before you wake up, this is the difference between results being ready at 9:00am vs. 9:30am. At scale — if Earnventory expands to 50 suppliers — the gap becomes untenable in a single-agent design.

---

## What "Multi-Agent" Actually Means

Multi-agent does not mean multiple Claude instances having a conversation. It means a structured system where:

1. **One agent (the orchestrator)** holds the high-level goal and the authority to delegate
2. **One or more agents (subagents)** receive specific, bounded tasks and return results
3. **The orchestrator synthesizes** subagent outputs to advance the high-level goal

```
┌─────────────────────────────────────────────────────────────┐
│  SINGLE-AGENT SYSTEM                                         │
│                                                             │
│  User ──> [Agent: everything] ──> Tools ──> Response        │
│                                                             │
│  One context window. One system prompt. Sequential.         │
│  Ceiling: context budget, focus, speed.                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  MULTI-AGENT SYSTEM                                          │
│                                                             │
│              ┌──> [Subagent 1: Pricing] ──> Tools ──┐       │
│  User ──>    │                                       │       │
│  [Orchestrator] ──> [Subagent 2: Inventory] ──> Tools ──> Synthesize ──> Response
│              │                                       │       │
│              └──> [Subagent 3: Supplier Health] ──> Tools ──┘
│                                                             │
│  Each agent: isolated context window, focused system prompt │
│  Orchestrator: receives outputs, not raw data               │
└─────────────────────────────────────────────────────────────┘
```

The key structural point: each subagent has an **isolated context window**. The orchestrator does not pass its entire context to each subagent — that would eliminate the benefit. It passes a specific, bounded task. The subagent works, returns a result, and its context window is discarded. The orchestrator stays lean.

This is the "minimum viable handoff" principle, which we'll spend a full day on in Day 32.

---

## Applied to Earnventory: What This Looks Like

Here is the same weekly supply chain review, decomposed into a multi-agent architecture:

**Orchestrator task:** "Run Earnventory weekly supply chain review. Assess pricing risk, inventory gaps, and supplier reliability for all active suppliers. Return a prioritized action list."

**Subagent 1 — Pricing Analyst**
- *System prompt:* Focused on numerical margin analysis
- *Context:* Last 90 days of pricing data, target margins, currency rates
- *Task:* Identify SKUs where current supplier pricing puts margin below threshold
- *Returns:* List of at-risk SKUs with magnitude and affected suppliers

**Subagent 2 — Inventory Monitor**
- *System prompt:* Focused on stock level computation and urgency ranking
- *Context:* Current inventory, reorder thresholds, daily velocity
- *Task:* Identify all SKUs below reorder threshold, ranked by urgency
- *Returns:* Ordered list of SKUs needing attention, with projected stockout dates

**Subagent 3 — Supplier Reliability Check**
- *System prompt:* Focused on qualitative delivery performance assessment
- *Context:* Last 6 months of delivery records, promised vs. actual lead times
- *Task:* Score each active supplier on recent reliability
- *Returns:* Reliability scores with flags for degraded performance

**Orchestrator synthesis:**
Receives three structured results. No raw email text. No inventory tables. Just the signal. Combines them into a prioritized action list: "Order SKU-A from Supplier X urgently (3 days of stock, but reliability score is 7/10 — acceptable). Do not reorder SKU-B from Supplier Y yet (18 days of stock), but flag supplier for review (reliability score 4/10 — degrading)."

The orchestrator's context window stays focused on synthesis. Each subagent's context window was focused on its specific domain question. The total computational work is not less — but it is more efficient, more focused, and parallelizable.

---

## Why This Changes the Design Conversation

In single-agent architecture, the dominant design question is: *what tools does this agent need?*

In multi-agent architecture, you're answering a different set of questions:

- **Decomposition:** What subtasks can be separated with clear input/output contracts?
- **Parallelization:** Which of those subtasks are independent and can run simultaneously?
- **Context boundaries:** What data does each subtask actually need — and what should it explicitly not receive?
- **Synthesis:** Who receives the results, and what does the orchestrator need to combine them well?
- **Trust:** When a subagent returns a result, how does the orchestrator validate it before acting on it?

The last question is the one most practitioners underestimate, and it gets a dedicated day (Day 33: Trust between agents). For now, hold this principle: **a subagent's output is a recommendation, not a ground truth.** The orchestrator's job includes sanity-checking results before acting on them.

---

## The Consulting Firm Analogy

Think of a consulting firm engaged on a complex strategic acquisition.

The **engagement manager** (orchestrator) talks to the client, defines the scope, and knows which practice areas to call. The **tax practice** (subagent 1) analyzes the target company's tax exposure — they don't need to know about the logistics synergies, and giving them that context would just distract them. The **logistics practice** (subagent 2) analyzes supply chain overlap. The **market research team** (subagent 3) assesses competitive positioning.

Each practice has its own files, its own specialists, its own reasoning — they don't share a brain. The engagement manager synthesizes their deliverables into a unified recommendation.

Crucially: if the tax practice makes an error — say, miscalculates a deferred tax liability — that error propagates into the acquisition recommendation unless the engagement manager catches it. This is why good engagement managers don't just aggregate outputs; they validate them. Trust is explicit and earned, not assumed.

The same applies to multi-agent AI systems. An orchestrator that blindly trusts every subagent output is not a reliable system — it's an error-propagation pipeline. Validation, bounded scope, and explicit trust hierarchies are engineering requirements, not nice-to-haves.

---

## What's Coming This Week

Over the next seven days in Mini-Module 2.2:

- **Day 29:** The orchestrator/subagent pattern in depth — how tasks are delegated, how results return, what "isolated context windows" means for system design
- **Day 30:** Zazu + Abeiku as a live case study — the actual deployment, analyzed step by step at the architectural level
- **Day 31:** Three multi-agent topologies: pipeline (sequential handoff), fan-out (parallel dispatch), and swarm (dynamic routing)
- **Day 32:** Handoffs — what information transfers between agents and, critically, what shouldn't
- **Day 33:** Trust between agents — why it's harder than trust between services, and how to design for adversarial environments
- **Day 34:** Designing a multi-agent system for Earnventory end-to-end
- **Day 35:** When NOT to use multi-agent — the hidden costs of coordination overhead, and when a single agent with more tools is the right call

---

## Two Resources Worth Your Time

- **Anthropic's multi-agent systems guide:** https://platform.claude.com/docs/en/agents-and-tools/agents — Anthropic's first-party documentation on structuring multi-agent systems. Pay close attention to the section on trust hierarchies between agents — it foreshadows Day 33 and is the most underread part of the guide.

- **"Multi-Agent Orchestration: 5 Patterns That Work":** https://www.digitalapplied.com/blog/multi-agent-orchestration-5-patterns-that-work — A practical taxonomy of multi-agent patterns extending beyond the basic orchestrator/subagent model. Useful framing before we go deep on pipelines, fan-out, and swarms on Day 31.

---

*Day 29 tomorrow: the orchestrator and subagent roles in depth — including exactly what "isolated context windows" means and why it's the structural insight that makes multi-agent systems scale.*
