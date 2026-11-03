# AI Agents Day 29: Orchestrator and Subagent — The Fundamental Pattern

**Mini-Module 2.2 — Multi-Agent Systems | Day 2 of 8**

---

Yesterday you saw *why* multi-agent architecture exists: context windows fill, specialization beats generalism, and parallelization beats sequential execution. The three ceilings of single-agent design are real engineering constraints, not theoretical concerns.

Today we go one level deeper: exactly how multi-agent systems work. What the two roles are, how tasks move between them, and what "isolated context windows" means in practice. This is the foundational pattern every other multi-agent topology — pipelines, fan-out, swarms — is built on top of.

---

## Two Roles. That's It.

Every multi-agent system, regardless of complexity, is composed of two fundamental roles:

**The orchestrator** holds the high-level goal. It knows what the user wants, it has authority over the overall workflow, and its job is to decompose the goal into subtasks and delegate them. The orchestrator reasons about *what needs to happen* and *who should do it*. It does not necessarily execute work itself — its primary function is coordination.

**The subagent** receives a specific, bounded task from the orchestrator. It has its own model, its own tools, and its own system prompt. It executes the task, returns a result, and has no awareness of the broader system it belongs to. Its context window is isolated — it starts fresh with only what the orchestrator explicitly passes to it.

```
┌──────────────────────────────────────────────────────────────┐
│  THE FUNDAMENTAL MULTI-AGENT PATTERN                         │
│                                                              │
│  User request                                                │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  ORCHESTRATOR                                       │     │
│  │  - Holds the goal                                   │     │
│  │  - Decomposes into subtasks                         │     │
│  │  - Writes targeted task briefs                      │     │
│  │  - Validates and synthesizes results                │     │
│  └────────┬──────────────┬──────────────┬──────────────┘     │
│           │              │              │                     │
│    Task brief A   Task brief B   Task brief C                │
│           │              │              │                     │
│           ▼              ▼              ▼                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │  SUBAGENT 1  │ │  SUBAGENT 2  │ │  SUBAGENT 3  │         │
│  │  Fresh ctx   │ │  Fresh ctx   │ │  Fresh ctx   │         │
│  │  Own tools   │ │  Own tools   │ │  Own tools   │         │
│  │  Own prompt  │ │  Own prompt  │ │  Own prompt  │         │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘         │
│         │                │                │                  │
│       Result A        Result B         Result C              │
│         └────────────────┼────────────────┘                  │
│                          ▼                                    │
│                 ┌─────────────────┐                          │
│                 │  Orchestrator   │                          │
│                 │  synthesizes    │                          │
│                 └────────┬────────┘                          │
│                          │                                    │
│                    Final response to user                    │
└──────────────────────────────────────────────────────────────┘
```

The critical property: the orchestrator passes **task briefs**, not its full context. The subagent returns **synthesized results**, not raw data. Every boundary in this diagram is an information reduction.

---

## What "Isolated Context Windows" Actually Means

This is the architectural concept worth sitting with, because it's easy to imagine the wrong thing.

When Zazu (acting as orchestrator) delegates a task to Abeiku, Abeiku does not receive Zazu's conversation history. It does not receive the family's MEMORY.md. It does not receive the tool call log from Zazu's session. It receives a new conversation — a fresh context window — containing only what Zazu explicitly constructs and passes.

Mechanically, this looks like:

```
ORCHESTRATOR creates a new conversation for the subagent:

  System: [Subagent's own system prompt — written for its specific role]

  User:   [Task brief from orchestrator]
          "Analyze the following supplier invoices from the last 30 days
           and identify any SKUs where the unit cost has increased more
           than 5% since the prior period. Return a JSON list.

           <invoices>
           [invoice data — explicitly provided]
           </invoices>"
```

That's it. The subagent sees its system prompt and the task brief. Nothing else. It reasons, calls tools if it has them, and generates a response. The orchestrator then reads that response and incorporates it into its own context.

```
BEFORE delegation:
  Orchestrator context window
  ├── System prompt
  ├── User request: "Run supply chain review"
  ├── Tool results from earlier steps
  └── [200K token budget — partially consumed]

SUBAGENT context window (independent)
  ├── Subagent system prompt
  ├── Task brief from orchestrator (concise)
  └── [200K token budget — fresh, mostly empty]

AFTER delegation:
  Orchestrator context window
  ├── System prompt
  ├── User request
  ├── Tool results from earlier steps
  └── Subagent result (synthesized output — compact)
```

Notice what did NOT transfer: the orchestrator's full tool call history, its intermediate reasoning, the raw data it retrieved. Only the task brief went in. Only the result came back. The orchestrator's context window grows by the size of the result, not by the size of everything the subagent did to produce it.

This is why isolated context windows scale. The orchestrator's context grows proportionally to the *number of results it receives*, not to the *total work done to produce those results*. For a 10-subagent system, the orchestrator holds 10 compact results rather than 10 full execution traces.

---

## How Instruction Passing Works in Practice

The orchestrator has two mechanisms for passing instructions to subagents: **direct invocation** and **tool-mediated delegation**.

### Direct Invocation (Claude Agent SDK)

In the Claude Agent SDK, an orchestrator can spawn a subagent as a tool call. The SDK handles context isolation automatically:

```python
# Orchestrator calls a subagent via the SDK
result = await client.run(
    system="You are a pricing analyst. Your job is to identify...",
    messages=[{
        "role": "user",
        "content": task_brief   # Only this enters the subagent's context
    }]
)
```

The SDK creates a new agent instance — fresh context, the specified system prompt, and nothing else. This is the cleanest form of isolation.

### Tool-Mediated Delegation

In a tool-using orchestrator, delegation can also happen through a purpose-built tool:

```
Tool definition: run_subagent
  - name: "run_pricing_analyst"
  - description: "Delegate a pricing analysis task to the pricing analyst subagent"
  - input: { task: string, invoice_data: array }

Orchestrator calls tool → your application spawns a new agent → result returned as tool_result
```

In this model, the orchestrator doesn't know how the subagent works — just what it takes as input and what it returns. This is particularly useful when subagents are specialized services that might be non-Claude models, database queries, or external APIs. The orchestrator treats them all through a uniform tool interface.

---

## The Information Architecture of a Task Brief

What makes a good task brief? This is a design question with real consequences for output quality.

A task brief should be:

**Complete** — the subagent has everything it needs and cannot ask for more. Unlike a conversation with a human collaborator, the subagent will not say "wait, what's the baseline period for comparison?" It will make an assumption and proceed. Your brief must preempt the questions.

**Bounded** — the subagent receives exactly the data relevant to its task. Passing extra context doesn't help and can mislead. If you're asking a subagent to analyze Supplier A's pricing, don't include Supplier B's invoices "for reference." The subagent may try to compare them, introducing scope creep you didn't intend.

**Structured** — the output format should be specified explicitly. "Return a JSON array of objects with keys: sku_id, current_unit_cost, prior_unit_cost, change_percent" is better than "identify pricing changes." The orchestrator needs to parse the result programmatically; free-form prose is harder to synthesize reliably.

```
WEAK TASK BRIEF:
───────────────
"Look at these invoices and tell me if anything looks off."

STRONG TASK BRIEF:
──────────────────
"You are analyzing supplier invoices for an Earnventory inventory 
management system. Your task: identify SKUs where unit cost has 
increased more than 5% between the comparison period (March 2026) 
and the current period (April 2026).

Return a JSON array. Each object must have:
  - sku_id (string)
  - supplier_id (string)
  - march_unit_cost (number, USD)
  - april_unit_cost (number, USD)  
  - change_percent (number, signed)

If no SKUs exceed the threshold, return an empty array.

<invoice_data>
[invoice data here]
</invoice_data>"
```

The difference is not formality — it's the absence of ambiguity. The strong brief leaves no room for the subagent to interpret what "looks off" means or what format to use. This matters because the orchestrator will receive the output and act on it, often without human review.

---

## Applied to Earnventory: The Orchestrator's Decision Loop

Here is what the orchestrator's actual reasoning process looks like — the inner monologue of a well-designed orchestrator running the weekly supply chain review:

```
ORCHESTRATOR REASONING (simplified)

Step 1: Parse goal
  "Run weekly supply chain review for all active suppliers."
  → This requires: pricing risk, inventory gaps, supplier reliability.
  → Three independent analyses. Dispatch in parallel.

Step 2: Construct task briefs
  → Pricing analyst brief: [last 30 days invoices, target margins]
  → Inventory monitor brief: [current stock, reorder thresholds, daily velocity]
  → Reliability check brief: [last 6 months delivery records]

Step 3: Dispatch subagents (parallel)
  → tool_use: run_pricing_analyst(brief_A)
  → tool_use: run_inventory_monitor(brief_B)
  → tool_use: run_reliability_check(brief_C)

Step 4: Receive results
  → pricing_result: [list of 4 at-risk SKUs with cost changes]
  → inventory_result: [list of 7 SKUs below reorder threshold]
  → reliability_result: [3 suppliers flagged for degraded performance]

Step 5: Validate and cross-reference
  → Are any at-risk SKUs also below reorder threshold? Yes: SKU-042.
  → Is the supplier for SKU-042 reliability-flagged? Yes: Supplier-07.
  → Flag: urgent reorder from SKU-042, but Supplier-07 is unreliable.
    Action: reorder from alternative supplier, not Supplier-07.

Step 6: Synthesize output
  → Produce prioritized action list with reasoning.
```

The orchestrator's value is in steps 4–6: validation, cross-referencing, and synthesis. The subagents did the data work; the orchestrator does the integration. Neither could produce the final output alone.

---

## What the Subagent Doesn't Know — and Why That's Intentional

Here is something worth pausing on: the pricing analyst subagent in the above example doesn't know it's part of a larger system. It doesn't know there's a reliability check happening in parallel. It doesn't know the orchestrator will cross-reference its findings with inventory data.

This is intentional. An agent that knows too much about the system around it will try to optimize for the system, not for its specific task. A pricing analyst focused solely on "identify cost increases >5%" produces more reliable, more auditable results than one that is simultaneously hedging its findings based on what it imagines the orchestrator will want to hear.

This is a soft form of the general principle: **bounded scope produces more reliable outputs than unbounded scope**. You saw this in the specialization argument (Day 28). It applies here too — but now at the information level, not just the prompt level.

The subagent's isolation is a feature, not a limitation.

---

## The Consulting Firm Analogy — At the Instruction Level

You've heard the consulting firm analogy: orchestrator as engagement manager, subagents as specialists. Let's apply it at the instruction level, because the analogy breaks down in an important way.

When a real engagement manager briefs a tax specialist, the specialist can ask clarifying questions. They can say: "Wait — is this a domestic or cross-border transaction? That changes the analysis entirely." If the brief is unclear, the back-and-forth refines it before work begins.

An AI subagent cannot do this. It receives the brief, makes whatever assumptions its system prompt and training suggest, and returns a result. If the brief was ambiguous about the baseline comparison period, the subagent picks one — and the orchestrator will never know a choice was made.

This asymmetry makes brief-writing a first-class engineering responsibility. You are writing for an executor that will not push back and will not ask for clarification. The brief must be complete on first delivery.

This is one reason orchestrator design is harder than it looks: the orchestrator must anticipate every ambiguity the subagent might face and resolve it in the task brief, before delegation happens.

---

## Two Resources Worth Your Time

- **Anthropic's agent components documentation:** https://platform.claude.com/docs/en/agents-and-tools/agents — Anthropic's official breakdown of orchestrator and subagent roles, including how the Claude Agent SDK handles isolation. The section on "agents as tools" is directly relevant to today's material.

- **"Building Effective Agents" (Anthropic Research):** https://www.anthropic.com/research/building-effective-agents — A research-grade overview of how agentic systems are actually built in practice, including the delegation patterns we've discussed. Reading this alongside today's material gives you both the conceptual model and the practitioner's view.

---

*Day 30 tomorrow: Zazu and Abeiku as a live case study — we walk through the actual deployment, trace exactly what Zazu passes to Abeiku and what returns, and name which architectural principles from today are visible in a system you already run every day.*
