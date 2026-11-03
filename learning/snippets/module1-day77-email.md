# AI Agents Day 77: Pipeline, Fan-out, and Swarm — Three Ways to Wire Agents Together

---

## What You Know Coming In

You have the orchestrator/subagent split (Day 75) and a live case study of how Zazu delegates to Abeiku (Day 76). Now the question is structural: when you have multiple agents, how do you wire them together?

The answer is not one pattern. It's three, and choosing the wrong one for your problem creates real costs — latency, debugging complexity, or simply the wrong behavior. This is an architectural decision you'll make explicitly when building any non-trivial agent system for Earnventory.

---

## Pattern 1: Pipeline

A pipeline is the simplest multi-agent topology. Agents run sequentially. Each agent consumes the previous agent's output and produces input for the next.

```
User Request
     |
     v
[Agent A: Extract]
     |
  output A
     |
     v
[Agent B: Analyze]
     |
  output B
     |
     v
[Agent C: Report]
     |
     v
Final Response
```

**When to use it:** When each step depends on the one before it. When the workflow is ordered and the steps cannot be parallelized without the preceding result. When you want predictable, traceable behavior.

**Earnventory example — supplier invoice audit:**

1. Agent A: Pull all supplier invoices from the last 30 days (from Gmail + drive). Output: raw invoice list.
2. Agent B: Analyze each invoice for anomalies — line items that changed more than 5% vs. prior month. Output: anomaly report with flagged items.
3. Agent C: Draft a summary for you, grouped by severity, with suggested follow-up actions. Output: the finished document.

Agent B can't run without Agent A's output. Agent C can't run without Agent B's output. That ordering is the defining property of a pipeline.

**The cost:** Every step adds latency. If you have 5 pipeline stages and each takes 10 seconds, your workflow takes at least 50 seconds. You cannot recover that time by adding more agents because the steps are sequential by definition.

**The benefit:** Debugging is straightforward. You can inspect each agent's output independently. If Agent C produces a bad report, you look at Agent B's output. If that's fine, the fault is in Agent C's prompt or tools. The data flow is a straight line.

---

## Pattern 2: Fan-Out

Fan-out inverts the pipeline's serialization. One orchestrator dispatches the same class of task to N agents in parallel. It then waits for all N to finish and synthesizes their results.

```
                Orchestrator
               /      |      \
              /       |       \
     [Agent 1]  [Agent 2]  [Agent 3]
     Supplier A  Supplier B  Supplier C
              \       |       /
               \      |      /
                Orchestrator
                (synthesize)
                     |
               Final Response
```

**When to use it:** When you have N independent tasks that share the same structure. When the tasks can run concurrently without depending on each other's outputs. When latency matters and the bottleneck is the number of tasks, not their sequential dependency.

**Earnventory example — supplier price monitoring:**

You have 20 active suppliers. Every morning, you want to know if any of them have sent pricing updates in the last 24 hours.

Serial approach (pipeline-adjacent): check Supplier 1, then Supplier 2, …, then Supplier 20. Time to result: ~20 × (time per supplier).

Fan-out approach: Orchestrator dispatches 20 agents simultaneously, one per supplier. Each agent checks that supplier's email thread, extracts any pricing changes, and returns a structured result. Total time: ~1 × (time per supplier) + orchestrator synthesis overhead.

That's a 20× latency improvement on the critical path.

**The cost:** Synthesis is the hard part. The orchestrator now has to combine 20 potentially inconsistent, conflicting, or differently-structured outputs into a coherent result. If one agent returns "no changes" and another returns an error and another returns a price update, the orchestrator has to handle all three cases. The synthesis logic can become more complex than the individual agents themselves.

**Fan-out also multiplies error surface.** If each agent has a 5% chance of returning something wrong, and you fan out to 20 agents, the probability that at least one returns a bad result is 1 - (0.95)^20 ≈ 64%. Your synthesis layer must be robust.

**Partial fan-out** is worth naming explicitly: you don't always dispatch N agents for N identical tasks. Sometimes you dispatch 3-4 specialized agents simultaneously and then synthesize their different perspectives. For Earnventory, that might be: [Agent: margin impact] + [Agent: inventory risk] + [Agent: relationship history] all running in parallel on the same supplier, with the orchestrator combining them into a risk score. This is fan-out, but with heterogeneous agents rather than homogeneous ones.

---

## Pattern 3: Swarm

A swarm has no fixed orchestrator. Agents route work to each other dynamically based on what each is equipped to handle. The path through the system isn't defined in advance — it emerges from the agents' own decisions about who should handle the next step.

```
[Agent A] <---> [Agent B]
    ^                ^
    |                |
    v                v
[Agent C] <---> [Agent D]
```

Arrows go in all directions. Any agent can hand off to any other. The system self-organizes around the task.

**When to use it:** Open-ended tasks where you don't know the path in advance. Research tasks that spawn sub-questions. Problems where different parts of a task require genuinely different specializations that aren't known until the task is in progress.

**Example:** "Research whether Supplier X is at financial risk." This might involve: reading recent news about the company, checking payment history in Earnventory, pulling any public filings, and comparing their pricing behavior against industry benchmarks. You don't know in advance which of those will be relevant. A swarm could let a research agent spin up specialist sub-agents as it discovers what questions need answering.

**The real cost of swarms:** Observability and debuggability drop sharply. In a pipeline, the data flow is linear — you can inspect every node. In a fan-out, you have N parallel flows that converge at synthesis. In a swarm, the actual path through the system is dynamic and only reconstructable after the fact from logs. When something goes wrong — and it will — tracing the error back to its source requires complete trace logging of every agent-to-agent handoff.

Swarms also introduce trust problems at scale. In a pipeline or fan-out, the orchestrator is a known, controlled entity. In a swarm, one agent's output becomes another agent's input, which can become another agent's system context. Prompt injection from a bad external data source can propagate further and faster in a swarm because there's no central point of validation.

For most production Earnventory use cases today, swarms are overkill and introduce complexity you can't easily justify. Pipeline and fan-out cover the vast majority of real workflows.

---

## Choosing the Right Pattern: A Decision Framework

```
Is the next step's input dependent on
the previous step's output?
        |
       YES                  NO
        |                   |
        v                   v
    PIPELINE          Are all N tasks the
                      same class of task?
                            |
                      YES        NO (heterogeneous)
                        |              |
                        v              v
                    FAN-OUT        Partial Fan-out
                                   (parallel specialists)

If the path through the system isn't
known until runtime → SWARM
(use carefully)
```

In practice, real agent systems combine patterns. An Earnventory pipeline might have a fan-out stage embedded in it: Stage 1 (pipeline) extracts the supplier list. Stage 2 (fan-out) checks all 20 suppliers in parallel. Stage 3 (pipeline) synthesizes the fan-out results and drafts the report. You're not choosing one topology for the whole system — you're choosing the right topology for each stage.

---

## Latency, Cost, and Debugging: The Trade-off Table

| Pattern  | Latency           | Parallelism | Debuggability | Best for                       |
|----------|-------------------|-------------|---------------|--------------------------------|
| Pipeline | Additive (serial) | None        | Excellent     | Ordered, dependent steps       |
| Fan-out  | Parallel ceiling  | High        | Good          | N independent same-class tasks |
| Swarm    | Unpredictable     | Variable    | Poor          | Open-ended, path-unknown tasks |

Debuggability is underrated in this table. In a production system, you will spend significant engineering time not building the happy path, but tracing failures. A pipeline that takes 30% longer than a fan-out but is trivially debuggable is often the right engineering call, especially early in a system's life.

---

## Practical Takeaway for Earnventory

Most of what you'll build maps cleanly to pipeline or fan-out:

- **Sequential business logic** (pull data → process → draft output) → pipeline
- **Checking N suppliers / N SKUs / N invoices for the same thing** → fan-out
- **Open-ended research or triage** → consider swarm, but start with a structured fan-out with a strong synthesis layer first

The temptation with swarms is that they feel flexible and powerful. They are. They're also where systems go to become unmaintainable. Reserve them for workflows where you genuinely cannot define the path in advance.

---

## Resources

- **"Multi-Agent Orchestration: 5 Patterns That Work"** — practical breakdown of real multi-agent topologies with implementation notes: https://www.digitalapplied.com/blog/multi-agent-orchestration-5-patterns-that-work

- **Anthropic's multi-agent systems guide** — the official architecture overview, including how the Agent SDK handles orchestration natively: https://docs.anthropic.com/en/docs/agents-and-tools/agents

---

*Tomorrow: Day 78 — Handoffs: what actually transfers between agents, what deliberately doesn't, and the "minimum viable handoff" principle that keeps multi-agent systems clean.*
