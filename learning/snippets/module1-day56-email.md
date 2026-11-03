# AI Agents Day 56: When Agents Plan Ahead — and When They Shouldn't

**Mini-Module 1.4 — Reasoning and Planning | Day 56 of the Nyche AI Curriculum**

---

## What We're Covering Today

Yesterday you saw extended thinking — the private scratchpad that lets Claude deliberate before committing to a response. Today we zoom out from the single-turn level to ask a question that governs entire agent workflows: does the agent decide the full plan upfront, or does it decide one step at a time?

This distinction — *planning* vs. *reactive execution* — is one of the most practically important design choices in agent systems. It determines how your agent handles uncertainty, how it recovers from errors, how much latency it adds before doing any useful work, and what failure modes it's vulnerable to. Getting it wrong is expensive in production.

---

## The Two Strategies

### Strategy 1: Upfront Planning (Plan-then-Execute)

The agent receives a goal, reasons about the full sequence of steps required to reach it, writes out a plan, and then executes that plan step by step.

```
[Goal received]
     ↓
[PLANNING PHASE]
  "I need to:
    1. Query all supplier invoices from last 30 days
    2. Cross-reference against purchase orders
    3. Flag discrepancies > $500
    4. Draft exception report
    5. Send to accounts team"
     ↓
[EXECUTION PHASE]
  Step 1 → Step 2 → Step 3 → Step 4 → Step 5
     ↓
[Done]
```

The plan is committed before any tool is called. Execution is largely mechanical after that — the agent is following a script it wrote for itself.

### Strategy 2: Reactive Replanning (Act-then-Decide)

The agent receives a goal, takes the most immediately obvious action, observes the result, and only then decides the next step.

```
[Goal received]
     ↓
[Turn 1] Reason: "I should start by pulling recent invoices"
         Act: query_invoices(days=30)
         Observe: 847 invoices returned
     ↓
[Turn 2] Reason: "847 is too many to scan individually.
                  I should filter for the high-value ones first."
         Act: filter_invoices(min_value=5000)
         Observe: 23 high-value invoices
     ↓
[Turn 3] Reason: "Now I can cross-reference these 23 against POs"
         Act: cross_reference(invoices=[...], purchase_orders=true)
         Observe: 4 discrepancies found
     ↓
[Turn N] ... continues adapting based on what it finds
```

There is no upfront plan. Each step's outcome informs the next step's decision.

---

## The Failure Modes

Understanding when each strategy fails is more valuable than knowing which is "better" — because neither is universally better.

### When Upfront Planning Fails

**Brittle plan execution.** Plans are written based on assumptions about the environment. When those assumptions turn out to be wrong — the data isn't where you expected, a tool returns an unexpected format, step 2 reveals that step 3 is now irrelevant — the agent may continue executing the plan anyway. It committed to a script. It's following the script.

```
Planned step 3: "Cross-reference against Q2 purchase orders"
Observation after step 2: The data is in Q3 format. Q2 POs aren't available.
Plan-executing agent: Tries to run step 3 anyway → tool error → possibly halts
Reactive agent: Adjusts next step based on this observation
```

**Goal drift through over-decomposition.** When agents plan long multi-step sequences, each decomposition introduces interpretation. "Summarize discrepancies" in the plan might get interpreted in step 5 differently than the original goal intended. The longer the plan, the more drift accumulates between the original goal and what's actually executed.

**Wasted computation on invalidated steps.** If step 1 produces a result that makes steps 3–7 unnecessary, an upfront planner may still execute them. It doesn't know the plan is now pointless until after step 7.

### When Reactive Replanning Fails

**Infinite loops.** A reactive agent that doesn't have a crisp stopping condition can loop. "Check if there are more discrepancies → yes → check more deeply → still yes → check more deeply..." This is why reactive agents need explicit loop limits or stopping criteria in their system prompt.

**Local optima trapping.** Reactive agents can tunnel into a subproblem they found interesting in step 2 and never return to the broader goal. They're optimizing locally — what's next given what I just saw — without maintaining a view of the full objective.

**Expensive re-orientation.** If the agent doesn't maintain a running summary of what it's done so far, each reactive step may re-derive context from scratch. This burns context tokens and often leads to the agent losing track of where it is in the overall task.

**Difficulty with tasks that require global awareness.** Some tasks require knowing the full scope before any step makes sense. Writing a report that covers 10 topics, where the introduction should reference the conclusion — you need the full picture before you can write the first word. Reactive execution struggles here.

---

## Hierarchical Task Decomposition: A Middle Path

Production agent systems often use a hybrid: *hierarchical task decomposition*.

The idea: the agent plans at a high level (identifying 3–5 major phases), then executes each phase reactively — adapting within the phase without replanning the whole task.

```
HIGH-LEVEL PLAN (committed upfront):
  Phase 1: Data gathering
  Phase 2: Analysis
  Phase 3: Report generation

WITHIN PHASE 1 (reactive):
  Turn 1: Query invoices → observe volume → decide to filter
  Turn 2: Filter by value → observe results → decide next filter
  Turn 3: Cross-reference filtered set → done with phase 1

WITHIN PHASE 2 (reactive):
  Turn 4: Analyze discrepancies → notice pattern → explore pattern
  Turn 5: Confirm pattern → done with phase 2

...and so on
```

This is the pattern most mature agent systems converge on. The high-level plan provides structure and prevents local optima trapping. The within-phase reactivity handles the inevitable surprises in real-world data and tool outputs.

---

## The Role of Extended Thinking in Planning

Yesterday's topic — extended thinking — connects directly here.

When an agent uses extended thinking to *plan*, it's doing upfront decomposition in the scratchpad before committing to any tool call. The plan lives in the thinking block. The first tool call that appears in the response is already step 1 of an internally committed plan.

This has a subtle implication: even if the agent appears to be behaving reactively (one tool call at a time), it may be re-planning in its thinking block at each turn. From the outside it looks reactive — but internally it's doing a mini-planning cycle before each visible action.

```
What you see in API responses:
  Turn 1: call query_invoices()
  Turn 2: call filter_invoices()
  Turn 3: call cross_reference()

What's in the thinking blocks (if extended thinking is enabled):
  Turn 1 thinking: "I should start with invoices. But I should also
                    think about what I'll do if there are too many.
                    If > 500 results, filter by value first."
  Turn 2 thinking: "Got 847. As expected, too many. Filter to high-value.
                    After that, cross-reference. If cross-reference fails,
                    try the backup approach using the PO numbers directly."
  Turn 3 thinking: "23 results. Cross-reference is feasible now..."
```

Extended thinking effectively gives the agent a per-turn re-planning scratchpad. It's reactive at the tool-call level, but not purely reactive — it's re-evaluating the full strategy at each step.

---

## Practical Design Implications for Earnventory

**When to plan upfront:**

- Tasks with well-defined scope and predictable data. "Generate a standard monthly supplier report" — the steps are known in advance, the data format is stable.
- Tasks that require a consistent structure in the output. "Write a procurement brief that covers cost, lead time, and risk for each supplier" — you need to know the structure before you start writing.
- Tasks where a wrong step is expensive to reverse. If step 3 involves sending an email or creating a purchase order, you want a human-reviewed plan before execution begins, not a reactive system that might act before the operator has a chance to review.

**When to use reactive replanning:**

- Investigative or exploratory tasks. "Find out why our margins dropped in Q3" — you don't know the answer structure until you've found the answer.
- Tasks where the environment is unpredictable. Querying external APIs, reading variable-format supplier emails, parsing invoice documents with inconsistent layouts.
- Tasks where the stopping condition depends on what you find. "Keep digging until you've found the root cause" — you can't plan how deep to dig before you start.

**Designing stopping conditions for reactive agents:**

This is often the missing piece. A reactive agent without a stopping condition is a liability in production.

```
Good stopping conditions:
  - "Stop when you have found at least 3 confirmed discrepancies OR
     have checked all 23 high-value invoices, whichever comes first"
  - "Stop when the total token budget for this task exceeds 8,000 tokens"
  - "Stop when you have enough information to produce a complete draft report"
  - "Stop after N tool calls and escalate to human review if unresolved"

Weak stopping conditions:
  - "Stop when you're done" (circular — the agent decides when it's done)
  - "Stop when you've found everything" (unbounded — might run forever)
```

The system prompt is where you encode stopping conditions. They're constraints, not suggestions.

---

## How Zazu Handles This

Zazu is predominantly reactive in its execution — it receives a task, takes the most obvious first action, observes, and decides what's next. But Zazu also has implicit planning structure from its system prompt: the categories of tasks it handles, the order of operations within those categories, and explicit constraints on irreversible actions (like sending emails or creating calendar events) that require confirmation before execution.

This is a form of hierarchical decomposition baked into the system prompt rather than dynamically generated at runtime. Zazu's "phases" are defined by Zazu's identity and permissions, not by a planning module. It works because Zazu's task space is narrow and well-defined.

An Earnventory agent would need more explicit planning structure — the task space is broader, the data more variable, the consequences of wrong actions (incorrect purchase orders, misfiled invoices) more significant. There, you'd want a more formal hierarchical planner or, at minimum, explicit checkpoints where the agent summarizes what it's found and asks for confirmation before proceeding to execution phases.

---

## Summary

| Strategy | Best for | Fails when | Key risk |
|---|---|---|---|
| Upfront planning | Predictable scope, structured output, high-stakes actions | Assumptions wrong, data surprises, plan invalidated mid-execution | Brittle execution, wasted steps |
| Reactive replanning | Exploratory tasks, variable data, unknown stopping point | No stopping condition, local optima trapping | Infinite loops, context drift |
| Hierarchical decomposition | Most production tasks | Over-decomposition at high level | Goal drift between phases |

The most important design question isn't "plan or react" — it's: **at what granularity do you plan, and where do you allow the agent to adapt?**

---

## Free Resources

- **Anthropic's agentic behavior guide**: https://docs.anthropic.com/en/docs/build-with-claude/agents — covers how to design agent loops with appropriate planning and stopping conditions, including guidelines on long-horizon tasks.

- **"LLM Agents: Survey of Planning Approaches"** (arXiv 2024): https://arxiv.org/abs/2404.11689 — academic survey comparing upfront planning, reactive, and hierarchical decomposition methods across benchmark tasks. Technical but readable if you skim the intro and §3.

---

*Next up — Day 57: How memory and planning fit together — a unified picture of how Zazu reasons and remembers across time.*
