# AI Agents Day 63: Planning vs. Reactive Execution

**Mini-Module 1.4 — Reasoning and Planning | Day 63 of the Nyche AI Curriculum**

---

## Where We Are

The last four days built the reasoning arc of Mini-Module 1.4:

- **Day 59:** when chain-of-thought makes things worse — the failure modes of CoT nobody talks about
- **Day 60:** how to elicit reasoning reliably — structured checkpoints and controlled CoT
- **Day 61:** the ReAct pattern — reason, act, observe, reason again until the task resolves
- **Day 62:** extended thinking — the reasoning phase before output, hidden in the API response

Today completes the arc: **when should an agent plan the full route before taking the first step, and when is committing to an upfront plan exactly the wrong call?**

This is the question underneath all of Mini-Module 1.4. CoT, ReAct, and extended thinking are reasoning *mechanisms*. Planning vs. reactive execution is a *strategy decision* that determines which mechanisms are even appropriate. Getting this right is what separates agent workflows that are reliable from those that are brittle.

---

## The Two Modes

Every multi-step agent task can be executed in one of two fundamentally different ways, or a hybrid of both.

**Upfront planning:** Before executing any step, the agent decomposes the full task into an explicit sequence — a plan. Steps 1 through N are identified and (at least partially) specified before step 1 executes. The agent then follows the plan, revising it only if something unexpected forces a change.

**Reactive execution:** The agent decides each next step *after* observing the result of the previous one. There is no explicit plan — the agent reasons from the current state and available information to determine what to do next. This is the ReAct pattern at its most natural expression.

Neither is universally better. The right choice depends on the structure of the task — specifically, how much the observations at each step determine the *structure* of subsequent steps (versus just the *inputs* to those steps).

---

## Upfront Planning: How It Works

In an upfront planning approach, the agent's first action is to generate a plan. This typically happens through one of two mechanisms:

**Explicit plan generation:** The orchestrator calls the model with the task description and asks it to output a structured plan before any tool calls. The plan is then used to drive the execution loop.

```
PLANNING PHASE:
  User: "Generate reorder recommendations for all SKUs below threshold."
  
  Model (planning call):
  PLAN:
    Step 1: query_inventory(threshold=reorder_level) → get all low-stock SKUs
    Step 2: for each SKU, get_supplier_options(sku_id) → candidate suppliers
    Step 3: for each SKU, get_demand_forecast(sku_id, weeks=4) → quantity needed
    Step 4: rank_supplier_options(price, lead_time, quality) → best option per SKU
    Step 5: generate_reorder_draft(sku_id, supplier_id, quantity) → draft PO
    Step 6: compile_report(drafts) → summary for review

EXECUTION PHASE:
  Execute step 1 → observe → execute step 2 → observe → ...
```

**Hierarchical decomposition:** For more complex tasks, the plan itself is hierarchical — high-level goals broken into sub-tasks, each of which may have its own internal loop. The orchestrator manages the high-level structure; subagents handle each component.

The critical property of upfront planning: **the shape of the work is determined before the work begins.** What changes during execution is the *content* — the specific data flowing through each step. The *structure* is fixed.

---

## When Upfront Planning Wins

Upfront planning is well-suited for tasks with two specific properties:

**Structural predictability.** The steps required to complete the task don't depend on what you find. You know before you start that you'll need to do X, then Y, then Z — the structure holds regardless of the data.

**Completeness requirements.** The task requires acting on *every* element of a set, not just the interesting ones. "Review all 40 SKUs" rather than "find something interesting in the inventory."

Earnventory examples where upfront planning is appropriate:

- **Batch reorder analysis:** Every SKU below threshold gets the same treatment. The sequence is always: check stock → check supplier → check demand → draft PO. No discovery is going to add a step that wasn't in the original plan.
- **Monthly supplier scorecard generation:** A fixed set of metrics computed the same way for each supplier, compiled into a report. Same structure, different data.
- **Invoice reconciliation batch:** For each invoice, match to PO, check line items, flag discrepancies. Same procedure, repeated N times.

In these cases, upfront planning is efficient: the model allocates one reasoning step to understand the full task, then executes mechanically. No re-planning overhead per step. Predictable token usage. Easier to parallelize (you know all the work upfront; you can fan it out).

---

## When Upfront Planning Fails

Upfront planning breaks down when the structure of the work — not just the content — depends on what you discover.

**The discovery problem.** If observation at step 2 reveals that step 3 needs to be something you didn't anticipate, a rigid plan is a liability. The agent either ignores the new information (following the plan faithfully but wrongly) or abandons the plan (wasting the upfront planning cost and introducing inconsistency).

**The false premise problem.** Upfront plans are generated from a model's prior understanding of the task — before it has seen any actual data from this specific run. If the data contradicts the premise of the plan, the plan is wrong from step 1. A reactive agent catches this immediately; a planning agent may execute several wrong steps before noticing.

**The branching problem.** Tasks where the next action depends on a classification of the current observation are poorly served by upfront planning. "If the invoice matches the PO, file it. If there's a discrepancy, investigate the discrepancy and escalate if above $500, otherwise log it." You can plan the branching structure, but the actual execution path is not determinable upfront.

Earnventory examples where upfront planning fails:

- **Margin anomaly investigation:** "SKU Y's margin dropped 11 points last quarter — find out why." You don't know if it's a pricing change, a cost spike, a reclassification, a one-time event, or a data error. Each intermediate finding determines what to check next. An upfront plan is speculative at best.
- **Supplier dispute resolution:** "Supplier A claims we haven't paid Invoice #4817 — investigate." Whether you're tracing a payment processing failure, a bank routing issue, a PO mismatch, or a fraud risk depends entirely on what you find in the first few lookups.
- **Open-ended competitive analysis:** "What pricing pressure should we expect in the industrial fastener category next quarter?" The research path depends on what signals appear. You can't plan this; you navigate it.

---

## The Reactive Alternative — And Its Limits

Reactive execution (the ReAct pattern you saw on Day 61) sidesteps the planning problem by treating each step as a fresh decision based on current state. No plan is committed to upfront. Each observation constrains the next action.

The strengths of reactive execution map precisely to upfront planning's weaknesses: it adapts naturally to unexpected findings, handles branching without over-specification, and doesn't over-invest reasoning in the structure of work that hasn't happened yet.

But reactive execution has its own failure modes:

**Goal drift.** Without a plan anchoring the overall objective, a reactive agent can follow a chain of plausible-looking steps that drifts away from what the user actually wanted. Each step is locally reasonable; the cumulative trajectory is wrong.

**Coverage gaps.** For batch tasks, reactive execution provides no guarantee that all elements were processed. There's no checklist against which to verify completeness — just a chain of decisions that stops when the agent decides it's done.

**Inefficiency for predictable structure.** If you know the task is going to require 40 iterations of the same procedure, reactive execution re-decides the next step 40 times, each time concluding "yes, do the same thing." That's unnecessary overhead.

**Coordination difficulty.** If you need to delegate subtasks to multiple subagents working in parallel, you need to specify those subtasks upfront. You can't fan out reactively — parallelization requires knowing what to parallelize before the work begins.

---

## The Hybrid: Plan High, Execute Reactively

The most robust real-world agent designs combine both modes. The strategy: **plan the structure at a high level, execute each component reactively.**

```
HYBRID ARCHITECTURE:
──────────────────────────────────────────────────────────────────

HIGH-LEVEL PLAN (upfront):
  Task: "Quarterly supplier review"
  
  Component A: Performance analysis (Suppliers 1–12)
  Component B: Pricing trend assessment
  Component C: Risk flag identification
  Component D: Executive summary compilation

  (These components are stable regardless of findings — the plan holds.)

REACTIVE EXECUTION (within each component):
  Component A, Supplier 1:
    REASON: Start with delivery performance — check on-time rate
    ACT: get_delivery_stats(supplier=1, period="Q3")
    OBSERVE: 94% on-time — above threshold
    REASON: Check quality metrics
    ACT: get_quality_metrics(supplier=1, period="Q3")
    OBSERVE: 2 defect events, both resolved
    REASON: Acceptable — log summary and move on
    
  Component A, Supplier 7:
    REASON: Start with delivery performance
    ACT: get_delivery_stats(supplier=7, period="Q3")
    OBSERVE: 61% on-time — significantly below threshold
    REASON: This warrants deeper investigation before moving to quality
    ACT: get_shipment_delay_breakdown(supplier=7)
    OBSERVE: 3 major delays all in July — single-month concentration
    REASON: Check whether root cause was on their side or logistics
    ACT: get_logistics_notes(supplier=7, month="July-2026")
    ...  ← reactive path varies based on what's found

──────────────────────────────────────────────────────────────────
```

The high-level plan provides structure, completeness guarantees, and coordination capability. The reactive execution within each component handles discovery, branching, and adaptation.

This is the pattern most production agents actually use, even when it's not explicitly designed that way. The orchestrator has a plan; the subagents or sub-loops execute reactively.

---

## ASCII Diagram: The Three Architectures

```
UPFRONT PLANNING:
──────────────────────────────────────────────────────────────────
Task ──→ [planning call] ──→ PLAN: [step 1, step 2, ... step N]
                                         ↓
                               [execute step 1] → observe
                                         ↓
                               [execute step 2] → observe
                                         ↓
                               [execute step N] → observe
                                         ↓
                                    DONE / report

Best for: predictable structure, completeness requirements, parallel fan-out.
Fails when: observations change the required steps, not just the content.


REACTIVE (ReAct):
──────────────────────────────────────────────────────────────────
Task ──→ REASON: what's the next logical action?
              ↓
           ACT: tool call
              ↓
         OBSERVE: result
              ↓
         REASON: what does this tell me? what next?
              ↓
           ACT: (different tool / same tool / terminate)
              ↓
         OBSERVE → REASON → ACT → ... → terminate when done

Best for: investigation tasks, high uncertainty, branching on findings.
Fails when: completeness is required, task drifts, parallelization is needed.


HYBRID (plan high, execute reactively):
──────────────────────────────────────────────────────────────────
Task ──→ [high-level plan]
           ↓         ↓         ↓
       Component A  Component B  Component C
           ↓
     [reactive sub-loop]
       REASON → ACT → OBSERVE → REASON → ... → Component A done
                                                     ↓
                                               Component B: reactive sub-loop
                                                     ↓
                                               Component C: reactive sub-loop
                                                     ↓
                                               Compile results → Done

Best for: structured batch tasks with variable content, most production agents.
```

---

## Planning in Multi-Agent Systems

The planning-vs-reactive question becomes more consequential in multi-agent architectures because the cost of mid-execution replanning multiplies.

When an orchestrator delegates to subagents, it must specify each subagent's task in the handoff. This is upfront planning at the multi-agent level — the orchestrator is committing to a task decomposition before knowing what each subagent will find.

This is why orchestrators in production multi-agent systems typically:

1. Use reactive execution for the *initial investigation* phase (one cheap subagent or direct tool call to understand the scope of the problem)
2. Switch to upfront planning once the scope is understood (now fan out to N subagents with well-defined tasks)
3. Have a synthesis step that handles discrepancies between what the plan expected and what the subagents actually found

Without this pattern, the orchestrator either over-plans (commits to a decomposition before it knows what it's decomposing) or under-plans (reactive execution at every level, which prevents effective parallelization and loses the efficiency of parallelism).

---

## Task Taxonomy: Which Mode for What

| Task type | Mode | Why |
|-----------|------|-----|
| Generate reorder recommendations for all SKUs below threshold | Upfront plan | Predictable steps, completeness required |
| Investigate margin drop on specific SKU | Reactive | Path depends entirely on findings |
| Monthly supplier scorecard (all suppliers, same metrics) | Upfront plan | Same procedure, different data, no discovery |
| Supplier dispute resolution | Reactive | What you investigate depends on initial findings |
| Quarterly review (structured phases, variable analysis) | Hybrid | Fixed structure, reactive within each section |
| Fraud investigation | Reactive | Unknown starting point, branching at every step |
| Batch invoice reconciliation | Upfront plan | Same steps for each invoice, completeness critical |
| Competitive pricing analysis | Reactive | Discovery-driven; you don't know what signals exist |

---

## What to Take Forward

The practical question when designing an agent workflow: **how much does the structure of the work depend on what you find?**

If the answer is "not much — I know the steps regardless of the data": plan upfront. You'll get efficiency, completeness guarantees, and easier parallelization.

If the answer is "a lot — early findings determine later steps": go reactive. You'll get adaptation, appropriate branching, and less wasted work on wrong upfront assumptions.

If the answer is "the high-level structure is predictable but within each section there's real discovery": go hybrid. Most production agents land here.

One more question worth asking: **what is the cost of a mid-execution plan failure?** If an upfront plan turns out to be wrong at step 6 of 10, can you recover gracefully? Or does step 5's execution (which assumed step 6 was coming) make recovery expensive? The higher the cost of replanning mid-execution, the more you want the reactive path that never committed to a plan in the first place.

Tomorrow: synthesis — pulling chain-of-thought, ReAct, extended thinking, and planning together as an integrated picture of how reasoning works in a complete agent workflow.

---

**Free Resources:**
- Anthropic's agent design patterns: https://docs.anthropic.com/en/docs/build-with-claude/agents
- "Building effective agents" — Anthropic's engineering blog: https://www.anthropic.com/engineering/building-effective-agents

---

*AI Agents curriculum by Abeiku | Delivered by Zazu | Day 63 of 50 — Mini-Module 1.4: Reasoning and Planning*
