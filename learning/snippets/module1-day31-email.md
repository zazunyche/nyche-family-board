# AI Agents Day 31: Pipeline, Fan-Out, and Swarm

**Mini-Module 2.2 — Multi-Agent Systems | Day 4 of 8**

---

Yesterday you traced the Zazu/Abeiku architecture in full — one orchestrator, one subagent, one task brief, one result. That's the atomic unit of multi-agent design.

Today we wire multiple units together. From that single building block, three distinct topologies emerge. They're named **pipeline**, **fan-out**, and **swarm**. Knowing which one to reach for — and when each one fails — is one of the more practically valuable skills in multi-agent engineering.

---

## The Three Topologies

### 1. Pipeline

Sequential chain. Agent A's output becomes Agent B's input, which becomes Agent C's input. Each agent in the chain has one upstream dependency and one downstream output. The next agent cannot start until the previous one finishes.

```
INPUT → [Agent A] → [Agent B] → [Agent C] → OUTPUT
```

**When pipeline is the right choice:**

- The task is inherently sequential — step B logically requires the output of step A
- Each stage transforms the data in a predictable, composable way
- You want clean failure isolation — if Agent B fails, nothing downstream runs

**Earnventory example: supplier invoice processing**

```
RAW EMAIL
    │
    ▼
[Parsing Agent]
  "Extract structured data from this invoice email.
   Return: { supplier_id, invoice_date, line_items[], total_amount }"
    │
    ▼
[Validation Agent]
  "Given this structured invoice, verify:
   (1) supplier_id exists in our system,
   (2) line item totals sum to total_amount,
   (3) no duplicate invoice_id in the last 90 days.
   Return: { is_valid: bool, validation_errors: [] }"
    │
    ▼
[Ledger Entry Agent]
  "Given this validated invoice, format a QuickBooks-compatible
   journal entry and flag any items that need manual review.
   Return: { journal_entry, manual_review_items[] }"
    │
    ▼
STRUCTURED INVOICE ENTRY + REVIEW FLAGS
```

Each stage sees only the output of the previous stage. The parsing agent doesn't know about the ledger format. The validation agent doesn't know what happens after it validates. Clean, composable, debuggable.

**The failure mode of pipelines: error amplification.** A parsing error in Agent A propagates silently through validation and into the ledger entry. By the time you see the problem, it's three stages downstream. This is why validation checkpoints matter in pipeline design — catch errors at the earliest possible stage.

---

### 2. Fan-Out

Parallel dispatch. One orchestrator sends tasks to N agents simultaneously, waits for all of them to complete, then synthesizes the results. The agents work in parallel — no agent waits for another.

```
                    ┌── [Agent 1] ──┐
                    │               │
INPUT → [Orchestrator] ── [Agent 2] ──┤── [Synthesizer] → OUTPUT
                    │               │
                    └── [Agent N] ──┘
```

**The key characteristic:** total runtime is determined by the *slowest* agent, not the *sum* of all agents. If each analysis task would take 10 seconds sequentially, dispatching 5 in parallel takes ~10 seconds — not 50.

**When fan-out is the right choice:**

- Tasks can be performed independently — no ordering constraint between them
- You're processing a set of similar items where each gets the same treatment
- Latency matters — you want the batch done faster than sequential execution allows

**Earnventory example: parallel supplier pricing review**

```
PRICING REVIEW REQUEST
        │
        ▼
[Orchestrator: Identify affected suppliers]
  → [supplier_001, supplier_002, supplier_003]
        │
        ├──────────────────────────────┬──────────────────────────┐
        │                              │                          │
        ▼                              ▼                          ▼
[Supplier 001               [Supplier 002               [Supplier 003
 Analysis Agent]             Analysis Agent]             Analysis Agent]
  Analyze pricing             Analyze pricing             Analyze pricing
  history, margins,           history, margins,           history, margins,
  renegotiation flags.        renegotiation flags.        renegotiation flags.
        │                              │                          │
        └──────────────────────────────┴──────────────────────────┘
                                       │
                              [Synthesizer Agent]
                              "Identify patterns,
                               rank urgency,
                               summarize for review."
                                       │
                                       ▼
                             PRICING REVIEW SUMMARY
```

Three agents run simultaneously. If each takes 8 seconds, total runtime is ~8 seconds — not ~24. The orchestrator dispatches all three, waits for all three, then synthesizes.

**The failure mode of fan-out: partial failure handling.** What happens when 2 of 4 agents succeed and 2 time out? Does the synthesizer proceed with partial data? Does the orchestrator retry the failures? Fan-out requires explicit policies for partial failure in a way that pipeline does not — you have to design these decisions before you need them.

---

### 3. Swarm

Dynamic routing. Agents route tasks to each other based on what they discover during execution. No fixed topology — the flow of work is determined at runtime, not at design time.

```
        [Agent A] ◄────────────────────┐
           │                            │
           │  Based on what it finds,   │
           │  routes to Agent B or C    │
           ▼                            │
        [Agent B] ──────────────────────┘
           │
           │  Based on what it finds,
           │  routes to Agent C or D,
           │  or back to Agent A
           ▼
        [Agent C / D / ...]
```

**The key characteristic:** agents make routing decisions. The orchestrator (if there is one) sets a goal, not a path. The path emerges from agent-to-agent handoffs at runtime.

**When swarm is the right choice:**

- The problem space is genuinely open-ended — you cannot enumerate the steps in advance
- Different branches of the task require fundamentally different expertise
- The task involves exploration and discovery, not execution of a known procedure

**When swarm is NOT the right choice:** most practical business workflows. Pipeline or fan-out handles the overwhelming majority of real-world multi-agent use cases. Swarm adds coordination complexity, non-deterministic routing, and debugging difficulty that only pays off in genuinely open-ended, exploratory tasks. An Earnventory pricing review is not a swarm task — it's a fan-out task with a predictable structure. Defaulting to swarm for its sophistication is a common mistake.

---

## Choosing the Right Topology

The decision tree is short:

```
Is the task inherently sequential?
  (Step B logically requires Step A's output)
              │
              ├── YES → Pipeline
              │
              └── NO
                    │
                    Is it a set of parallel-safe
                    items that all get similar
                    treatment?
                          │
                          ├── YES → Fan-out
                          │
                          └── NO
                                │
                                Is the problem genuinely
                                open-ended and unpredictable
                                at design time?
                                      │
                                      ├── YES → Swarm
                                      │         (with caution)
                                      │
                                      └── NO → Re-examine
                                               whether pipeline
                                               or fan-out fits
```

In practice, most agent systems are hybrids. A complete Earnventory workflow might use fan-out to parallelize supplier analysis *and* pipeline to sequence parsing → validation → ledger entry within each branch. You compose topologies from the same atomic building block.

---

## What These Topologies Look Like in Code

When you build with the Claude Agent SDK, these topologies have direct implementation patterns. It's worth seeing them side by side.

**Pipeline** (sequential, synchronous):
```python
result_a = await run_agent(parsing_agent, task_brief, raw_email)
result_b = await run_agent(validation_agent, task_brief, result_a)
result_c = await run_agent(ledger_agent, task_brief, result_b)
```
Each `await` blocks until that agent finishes. Three lines. Completely readable.

**Fan-out** (parallel, with synthesis):
```python
import asyncio

supplier_ids = await run_agent(orchestrator, identify_suppliers_brief)
tasks = [run_agent(analysis_agent, supplier_brief(sid)) for sid in supplier_ids]
analyses = await asyncio.gather(*tasks)  # all run simultaneously
summary = await run_agent(synthesizer, synthesis_brief, analyses)
```
`asyncio.gather` dispatches all agents simultaneously and waits for all to complete. Your partial-failure handling lives in the `gather` error policy (`return_exceptions=True` to continue with partial results, or let it raise on first failure).

**Swarm** (dynamic routing loop):
```python
state = initial_state
while not state.is_terminal():
    next_agent = routing_function(state)   # agent or rule decides what's next
    state = await run_agent(next_agent, state_brief(state))
```
The routing function is where all the complexity concentrates. It needs its own testing, its own failure handling, and its own guardrails against infinite loops. This is why you default to the simpler topologies — pipeline and fan-out are 3–5 lines; swarm requires engineering discipline to keep under control.

---

## The Pattern You'll Use Most

For Earnventory, you'll spend 90% of your time in two modes:

1. **Pipeline** for document processing — invoices, purchase orders, supplier contracts — where each stage transforms structured data before passing it forward.

2. **Fan-out** for bulk analysis — pricing reviews, inventory checks, supplier monitoring — where you're running the same analysis across many items and want results in parallel.

The third topology (swarm) is real and useful in the right context, but the right context is narrower than it sounds. When you reach for swarm, ask yourself: "Can I enumerate the steps in advance?" If yes, you don't need swarm.

---

## Tomorrow

Day 32: Handoffs — what information actually transfers between agents, and why the minimum viable handoff is the correct design principle. The quality of a multi-agent system lives in its handoffs more than anywhere else. We've been talking *around* handoffs all week; tomorrow we go inside one.

---

## Two Resources Worth Your Time

- **Anthropic's multi-agent systems guide:** https://platform.claude.com/docs/en/agents-and-tools/agents — The canonical reference for orchestrators, subagents, and parallel execution with the Claude Agent SDK. The pipeline/fan-out patterns above map directly to the SDK's invocation model.

- **"Multi-Agent Orchestration: 5 Patterns That Work":** https://www.digitalapplied.com/blog/multi-agent-orchestration-5-patterns-that-work — A broader taxonomy of multi-agent topologies with practical implementation notes. Pipeline and fan-out appear under slightly different names, alongside three additional patterns worth knowing when your system grows.

---

*Day 32 tomorrow: Handoffs — what transfers between agents, what should never cross the boundary, and the principle of minimum viable handoff.*
