# AI Agents Day 19: When Agents Plan Ahead — and When They Should
**Planning vs. Reactive Execution, Hierarchical Task Decomposition, and the Failure Modes of Over-Planning**

*Module 1.4, Day 19 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | July 5, 2026*

---

## The Short Version

Agents don't have a single fixed execution style. They exist on a spectrum from "plan everything upfront" to "react to each observation and decide the next step." Both extremes fail. The pattern that works in practice is hierarchical task decomposition: plan the high-level structure of a task, then execute each phase reactively — adapting as observations arrive without losing the global goal. Knowing when to plan more, when to react more, and how to detect that you've over-planned is a skill that applies directly to how you'd architect any Earnventory agent.

---

## The Two Ends of the Spectrum

Every agent implicitly sits somewhere on this axis:

```
SPECTRUM OF AGENT EXECUTION STYLE
═══════════════════════════════════════════════════════════════════════
 PURE PLANNER                                         PURE REACTOR
      │                                                       │
      ▼                                                       ▼
 Decompose entire task                              Take the single best
 into complete task tree                            next action, observe,
 before executing anything.                         then decide next step.
      │                                                       │
 Commits upfront.                              Stays maximally flexible.
 Executes leaf by leaf.                        No global plan at all.
      │                                                       │
 FAILURE: Step 4 assumption                   FAILURE: Local optimization
 breaks when step 3 surprises.                at every step; loses the
 Plan can't adapt mid-execution.              global goal in accumulated
                                              observations. Wanders.
═══════════════════════════════════════════════════════════════════════
                              │
                              ▼
                    HIERARCHICAL DECOMPOSITION
                    Plan the structure. React within it.
```

Neither extreme is robust. The pure planner fails when reality diverges from the plan's assumptions — and plans always diverge from reality eventually. The pure reactor fails when the task requires global coherence across many steps — each local move may be optimal, but the path meanders.

---

## When Upfront Planning Is Worth It

Planning a task structure before executing is worth the overhead when these conditions hold:

**1. Steps have hard dependencies.** You cannot do Step 4 without knowing what Step 2 returned. "Reconcile all supplier invoices for Q2 and flag discrepancies" is a planner task: data retrieval must complete before comparison can start, comparison must complete before flagging can start. The dependency structure is clear, so writing a plan captures real information.

**2. Mistakes compound and are costly.** If executing Step 6 (send a purchase order) before validating Step 3 (verify the supplier's quote matches the SKU) creates a problem that's hard to undo, committing the execution order upfront reduces the probability of irreversible errors.

**3. Parallelism is possible.** A plan lets the agent identify which steps are independent and can be dispatched in the same turn. Without a plan, the agent defaults to sequential execution even when parallelism is safe. With a plan: "Steps 2 and 3 have no shared dependencies — I can run them in a single API call."

**4. The task is well-defined.** The user's intent is specific and the "done" state is clear. Open-ended or exploratory tasks don't benefit from plans, because the plan would be invented rather than derived.

**Earnventory example — planner task:**

```
Task: "Prepare the monthly supplier performance report for June."

Plan:
  Phase 1 — Data Collection
    ├─ Retrieve all invoices received June 1–30
    ├─ Retrieve all purchase orders sent June 1–30
    └─ Retrieve delivery confirmations for June orders

  Phase 2 — Analysis  (depends on Phase 1 completing)
    ├─ Calculate on-time delivery rate per supplier
    ├─ Calculate invoice accuracy rate per supplier
    └─ Flag suppliers below threshold (< 90% on-time, < 95% accurate)

  Phase 3 — Output  (depends on Phase 2 completing)
    ├─ Draft executive summary (< 200 words)
    ├─ Build supplier-by-supplier breakdown table
    └─ Send report to distribution list

Now executing Phase 1...
```

The plan adds real value here: it captures the dependency structure, enables parallel execution within phases, and creates checkpoints where the agent can verify correctness before proceeding.

---

## When Reactive Execution Is Better

Pure reactive execution — the ReAct loop from Day 17 — is the right default when:

**1. The environment is unpredictable.** You don't know what you'll find, so planning beyond the next action would be speculative fiction. The plan would have to be revised after every step anyway.

**2. The task is exploratory.** "Does Supplier X have any unusual pricing patterns in their last 12 orders?" has no predetermined answer. The correct path through the data depends on what each query returns. Planning upfront would describe a path through a landscape you haven't seen.

**3. The optimal next step depends heavily on the previous observation.** When each observation materially changes what you should do next, planning ahead is wasted — you'd just be planning to look at data you haven't seen yet.

**4. The task is short.** Writing a 5-step plan for a task that needs 2 steps adds latency, token cost, and a surface for the plan to contradict itself. One-and-done tasks should just execute.

**Earnventory example — reactive task:**

```
Task: "Check whether any of today's deliveries arrived late."

Reason: I need to look up today's expected vs. actual deliveries.
Act: get_deliveries(date="2026-07-05", status="all")
Observe: 14 deliveries today; 2 have no confirmed receipt (SKU-C, SKU-F).

Reason: The 2 unconfirmed could be late or still in transit.
        Check tracking before flagging as late.
Act: get_shipment_tracking(sku_ids=["SKU-C", "SKU-F"])
Observe: SKU-C shows "delivered 09:42" — likely not yet logged in system.
         SKU-F shows "in transit, ETA 2026-07-06" — genuinely late.

Result: One delivery late (SKU-F). Flag for follow-up.
```

No plan was needed. The observations directly informed each next step. A plan upfront would have said: "Step 1: get deliveries. Step 2: check tracking for unconfirmed." Accurate, but it added no value over just starting.

---

## The Right Pattern: Hierarchical Task Decomposition

What works in practice combines both: **plan the structure at the phase level, react within each phase at the action level.**

```
HIERARCHICAL TASK DECOMPOSITION
════════════════════════════════════════════════════════════════════════

                        STRATEGIC LAYER (planned)
                    ┌─────────────────────────────────┐
                    │  Phase A → Phase B → Phase C    │
                    │  (dependencies, sequencing,      │
                    │   parallelism opportunities)     │
                    └─────────────────────────────────┘
                         ↓             ↓            ↓
                    ┌──────────┐  ┌──────────┐  ┌──────────┐
                    │ Phase A  │  │ Phase B  │  │ Phase C  │
                    │ reactive │  │ reactive │  │ reactive │
                    │  within  │  │  within  │  │  within  │
                    └──────────┘  └──────────┘  └──────────┘

TACTICAL LAYER (reactive, within each phase)
Each phase is a ReAct loop:
  Reason → Act → Observe → Reason → Act → Observe → until phase done

  The agent adapts locally to surprises without losing
  the global structure of the task.
════════════════════════════════════════════════════════════════════════
```

The manager/unit analogy applies: a general plans the campaign (capture the ridge, secure the supply route, hold the crossing), but each unit commander decides local tactics based on ground conditions. The general doesn't plan every footstep. The units don't need the full campaign map to execute their phase.

This is the structure Claude's extended thinking (Day 18) naturally produces for complex tasks. Given adequate scratchpad budget, it doesn't enumerate every micro-step — it identifies the major phases, notes the dependencies between them, and enters execution.

---

## The Failure Modes of Over-Planning

Planning has a dark side. Over-planning breaks agents in predictable ways.

### Failure Mode 1: Stale Plans

The plan was correct when written, but the environment changed mid-execution. An agent that commits to "send the purchase order in Step 6" may not notice that the supplier's invoice in Step 3 contained a pricing discrepancy — because the plan said to proceed, and the agent proceeds.

**Signal:** The agent executes subsequent steps without explicitly checking whether earlier observations have invalidated the plan.

**Fix:** Build observation checkpoints between phases. After completing Phase 1, the agent explicitly asks: "Does anything I just observed require revising the Phase 2 plan?" That checkpoint is cheap — a reasoning step, not an external action — and it prevents the plan from becoming rails the agent can't leave.

### Failure Mode 2: Plan Rigidity

The agent ignores new information because it's "following the plan." This is the robotic caricature of AI agents — mechanically executing a predetermined sequence with no environmental awareness.

**Concrete example:** An agent tasked with booking three meeting rooms. Its plan: "Book Room A, then B, then C." Room A is unavailable. A rigid agent fails: "Room A unavailable — task failed." A reactive agent adapts: "Room A unavailable — I'll find the next available room matching the criteria."

The fix is to treat the plan as a hypothesis, not a contract. The plan describes what to do *if everything goes as expected*. Observation gates check whether that's still true.

### Failure Mode 3: Planning Paralysis

The agent writes an 18-step plan for a task that needs 3 steps. It spends more tokens planning than it would have spent executing. The plan also creates more surface area for internal inconsistency — if Step 7 and Step 12 are in tension, the agent may not notice until it's mid-execution on Step 12.

**Rule of thumb:** A good plan has as many steps as there are real decision points — places where the output of one step is required input to the next. Any step that's just "execute the obvious action" can be collapsed into the reactive execution of the preceding decision.

### Failure Mode 4: Goal Drift from Over-Specification

When an agent plans every micro-step upfront, the plan can obscure the original goal. By Step 15, the agent is optimizing for "complete the plan" rather than "achieve the user's intent." If the user's intent was "flag supplier discrepancies," but the plan's final step is "generate a PDF report," the agent generates the PDF — even if the format is wrong or unnecessary.

The goal should stay in context throughout. The plan is a means, not the ends.

---

## The Failure Modes of Under-Planning (Pure Reactive)

Equally, agents that never plan have distinct failure modes:

**Myopia:** Each step is locally optimal but the agent wanders globally. The right series of locally good actions doesn't guarantee a globally coherent outcome. The agent may answer a question no one asked.

**Inconsistency:** In long tasks, the agent's implicit "goal" drifts as observations accumulate. Without a plan anchoring intent, it may answer a different question than it was asked — and not notice.

**Efficiency loss:** A 3-step solution takes 12 steps because the agent discovers the right structure empirically rather than reasoning about it upfront. Reactive discovery is expensive when the structure was knowable from the problem statement.

---

## How This Shows Up in Practice

When you ask Zazu something simple — "What's on the calendar for tomorrow?" — she doesn't plan. She calls the calendar tool and responds. No planning overhead, no unnecessary structure.

When you ask something complex — "Summarize all family tasks that are overdue and draft a message to whoever owns each one" — she uses hierarchical decomposition: identify overdue tasks (Phase 1), group by owner (Phase 2), draft per-owner messages (Phase 3). Within Phase 1, she reacts to what the task system returns. Within Phase 3, she adapts each draft to what Phase 2 revealed.

The distinction happens automatically because Claude infers from the task's complexity and dependency structure which mode is appropriate. You can reinforce the right behavior by specifying structure in your request: "First do X, then do Y, then Z" makes a plan implicit in the prompt. For Earnventory agents you build, you'll make this choice explicitly: should the agent receive an open-ended task and plan it? Or should you pre-specify the phases in the system prompt or tool definitions? The answer depends on how much the task structure is fixed vs. variable.

---

## Module 1 Complete

Day 19 is the last snippet of Mini-Module 1.4, which means **Module 1 is done.**

You've now covered the full reasoning stack of how agents work:

| Days  | Mini-Module               | Core Concepts                                                       |
|-------|---------------------------|---------------------------------------------------------------------|
| 1–5   | 1.1: What Is an Agent?    | Model + tools + loop + context; sense-plan-act                      |
| 6–10  | 1.2: The Model Underneath | Tokens, autoregressive generation, temperature, hallucination       |
| 11–15 | 1.3: Context, Memory, State | Context window as RAM; four memory types; RAG; context engineering |
| 16–19 | 1.4: Reasoning and Planning | CoT; ReAct; extended thinking; planning vs. reactive execution    |

Module 2 (Building and Running Agent Systems) starts after the quiz. The shift is from understanding to building: tool-use protocol, MCP, multi-agent patterns, the Claude SDK, prompt engineering at the API level, and production reliability.

Tomorrow: **the Mini-Module 1.4 quiz.** Five questions via iMessage, casual. Use them to check what's sticking and what's still fuzzy — the goal is calibration, not scoring.

---

## Free Resources

1. **Anthropic's chain-of-thought prompting guide**
   Covers how to elicit and structure chain-of-thought reasoning, including guidance that connects to today's planning concepts. The planning-vs-reaction tradeoff is directly related to how you prompt for structured CoT in practice.
   https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought

2. **"The 'think' tool: Enabling Claude to stop and think" — Anthropic Engineering**
   The engineering blog post on the think tool includes concrete examples of agents using explicit reasoning to plan before consequential actions — the closest thing to published Anthropic guidance on the planning layer of agent behavior.
   https://www.anthropic.com/engineering/claude-think-tool

---

## One Sentence to Carry Forward

The best agents plan the structure of a task upfront at the phase level — capturing real dependencies and enabling parallelism — then execute each phase reactively, so local surprises don't break global coherence and the plan stays a hypothesis rather than a contract.

---

*Day 19 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.4: Reasoning and Planning — Day 4 of 4 (Final)*
