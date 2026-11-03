# AI Agents Day 74: Why One Agent Isn't Enough

For the last eight days you've been building a sophisticated mental model of what a single agent can do: tool schemas that guide Claude's choices, handler functions your code executes, `tool_result` formats that close the loop, MCP as a portability layer, parallel tool calls for independent lookups, and the minimal-surface security principle that constrains what any agent is allowed to touch.

Yesterday you saw all of that assembled into a coherent Earnventory design — a reorder-monitoring agent with exactly four tools, separated into read and draft tiers, with no write access to anything irreversible. That design is good. It's also the best a single agent can be.

Today we hit the ceiling.

---

## The Three Limits of Single-Agent Systems

Every single-agent system — no matter how well designed, no matter how good the tooling — runs into the same three walls eventually. Understanding what those walls are, and *why* they exist at the architectural level, is what makes multi-agent systems feel inevitable rather than accidental.

### Limit 1: The Context Window Is Finite

You know this one from Mini-Module 1.3. The context window is the whiteboard — everything the agent can currently reason about must fit on it. Claude's context window is large (200K tokens for Sonnet and Opus as of mid-2026), but "large" is not the same as "unlimited."

The problem appears when task complexity scales. Consider what a real Earnventory supplier risk report actually requires:

- 20 supplier email threads from the last 30 days (each thread: ~2,000 tokens)
- Current inventory levels for 50 SKUs
- Pricing history for those SKUs across 6 months
- A formatted 3-page synthesis with recommendations

That's 40,000 tokens of email alone, before any tool results, before any reasoning. A context window that starts crowded forces tradeoffs: either you summarize inputs aggressively (losing fidelity), truncate early context (losing history), or you hit the limit mid-task and the agent simply stops.

There's a deeper problem too. Even when tasks technically fit in context, long contexts degrade performance. Research on transformer attention shows that models attend less reliably to information buried in the middle of a very long context — the "lost in the middle" effect. An agent reasoning from 150K tokens of context is meaningfully less reliable than one reasoning from 10K tokens of focused, relevant content.

Multi-agent systems solve this structurally: each agent gets a focused context window containing only what it needs to do its specific job. The email-reading agent sees email threads. The inventory agent sees SKU data. The synthesis agent sees polished summaries from both — not 150K tokens of everything.

```
Single-Agent (context overflow risk):
┌─────────────────────────────────────────────────────┐
│  CONTEXT (200K tokens max)                          │
│  [20 email threads] [50 SKU records] [pricing data] │
│  [tool results] [reasoning] [draft output] ...      │
│                                              ↑ full │
└─────────────────────────────────────────────────────┘

Multi-Agent (each agent sees a focused slice):
┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐
│  Email Agent     │  │  Inventory Agent  │  │  Synthesis Agent  │
│  [email threads] │  │  [SKU records]    │  │  [email summary]  │
│  [tool results]  │  │  [pricing data]   │  │  [stock summary]  │
│  [summary out]   │  │  [summary out]    │  │  [final report]   │
└──────────────────┘  └──────────────────┘  └───────────────────┘
```

### Limit 2: Sequential Execution Compounds Latency

A single agent is single-threaded in a meaningful sense: it reasons, calls tools, waits for results, reasons again. Even with parallel tool calls within a turn (Day 71), the agent itself is a bottleneck. Complex workflows require multiple sequential reasoning steps, and each step adds wall-clock time.

Latency compounds. If each step takes 3 seconds and you have 10 steps, you're at 30 seconds minimum — and that's a best-case estimate that ignores real-world variability. Now consider that your "supplier risk report" task has 40 meaningful steps: reading each email thread, cross-referencing with inventory, checking pricing trends, flagging anomalies, composing the synthesis. A single agent processing these sequentially might take 5-8 minutes.

Multi-agent systems break serial work into parallel branches. Instead of doing email → inventory → pricing → synthesis in sequence, you run email and inventory and pricing simultaneously — three agents working concurrently — then pass their outputs to a synthesis agent. A 5-minute task becomes a 90-second task.

```
Single-Agent (sequential):
Step 1 → Step 2 → Step 3 → ... → Step 40
│─────────────────── ~5 min ───────────────────│

Multi-Agent (parallel fan-out):
Email Agent   → ──────────────── summary ─┐
Inventory Agent → ─────────── summary ────┤→ Synthesis Agent → Report
Pricing Agent → ────────────── summary ───┘
│─── ~90 sec ───────────────────────────────│
```

This is the fan-out pattern: an orchestrator dispatches multiple subagents simultaneously, collects their outputs, and passes them to a downstream agent for synthesis. The wall-clock time is bounded by the slowest individual agent, not the sum of all of them.

### Limit 3: Failure Probability Multiplies

This one is counterintuitive until you see the math.

Suppose your agent is 95% reliable on any given reasoning step — an excellent error rate. If your task has 10 steps, the probability that *all 10 steps succeed* is:

```
0.95 × 0.95 × 0.95 × 0.95 × 0.95 × 0.95 × 0.95 × 0.95 × 0.95 × 0.95
= 0.95^10
= 0.60
```

A 95%-reliable agent running a 10-step task produces a correct final output only 60% of the time. Add 10 more steps — a 20-step task — and end-to-end reliability falls to 36%. By 40 steps: 13%.

Single-agent architectures have no structural response to this. You can write better prompts, add verification loops, reduce ambiguity — and you should — but the underlying math is stubborn. Long chains of reasoning are fragile.

Multi-agent systems don't eliminate this problem, but they change the architecture in ways that help. Each agent runs a short, focused task — maybe 3-5 steps. A 3-step agent at 95% per step is 86% reliable end-to-end, which is far better than a 40-step agent at 13%. Errors are isolated to individual agents; an orchestrator can detect a bad subagent output (by comparing it to the expected schema, running a validator, or asking a second agent to check it) and retry just that part — not the entire 40-step chain from scratch.

```
Single-Agent reliability across task length:
  5 steps:  0.95^5  = 77%
 10 steps:  0.95^10 = 60%
 20 steps:  0.95^20 = 36%
 40 steps:  0.95^40 = 13%

Multi-Agent (short subagents + retry):
  Each subagent: 3-5 steps → 86-77% per subagent
  Orchestrator validates + retries on failure
  End-to-end reliability: substantially higher
```

---

## What Multi-Agent Architecture Actually Solves

Put the three limits together and you get the clearest possible statement of why multi-agent systems exist:

| Problem | Single-Agent Response | Multi-Agent Response |
|---|---|---|
| Context overflow | Summarize, truncate, hope | Each agent gets focused context |
| Sequential latency | Faster model, tighter prompts | Parallel execution via fan-out |
| Failure compounding | Better prompts, more verification | Short subagents, isolated retry |

None of these are "nice to haves." For tasks that are long, complex, or latency-sensitive — which most production business workflows are — multi-agent design is the engineering-correct choice.

---

## The Earnventory Application

Think about the realistic scope of what an Earnventory AI system needs to do for you:

1. **Monitor** incoming supplier emails for price change signals
2. **Analyze** margin impact for affected SKUs
3. **Check** current inventory levels and days-of-stock remaining
4. **Draft** a purchase order recommendation
5. **Notify** you with a summary for human review

That's five meaningfully distinct jobs. Each accesses different data, requires different tools, and has a different failure mode. A single agent trying to do all five for 40 suppliers simultaneously is going to hit every one of the three limits above.

The multi-agent version looks like this:

```
                    ┌─────────────────┐
                    │  Orchestrator   │
                    │  (coordinates)  │
                    └────────┬────────┘
                             │  dispatches
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    ┌──────────────┐ ┌─────────────┐ ┌──────────────┐
    │ Email Reader │ │  Inventory  │ │   Pricing    │
    │   Agent      │ │   Agent     │ │   Agent      │
    └──────┬───────┘ └──────┬──────┘ └──────┬───────┘
           │                │               │
           └────────────────┴───────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │  Synthesis Agent  │
                  │  (draft + notify) │
                  └──────────────────┘
                            │
                            ▼
                      Human Review
```

Each agent is small, focused, and auditable. When something goes wrong — and eventually something will — you know exactly which agent failed and why. You retry that agent with corrected inputs. You don't restart the entire workflow.

---

## The Distinction to Keep in Mind

Multi-agent systems introduce real costs: coordination overhead, more complex infrastructure, more places for things to go wrong, longer debugging cycles. They are not universally better than single-agent systems. A single agent with good tools is almost always the right starting point. Multi-agent becomes the answer when you've pushed a single agent to its limits and hit at least one of the three walls above.

The decision heuristic: if your task doesn't fit in a focused context window, or requires parallelism for latency reasons, or chains more than ~10 sequential steps of reasoning, start thinking multi-agent. Otherwise, stay single.

Over the next seven days, you're going to go deep into every dimension of multi-agent design: the orchestrator/subagent pattern, what information actually passes between agents, the fan-out and pipeline topologies, the trust and security challenges unique to multi-agent systems, and how to design a full Earnventory multi-agent architecture from scratch.

Today's lesson is the motivation. Everything else is the mechanism.

---

## Free Resources

- **Anthropic's multi-agent systems guide:** https://platform.claude.com/docs/en/agents-and-tools/agents — the authoritative reference on how Claude handles multi-agent orchestration
- **"Why Multi-Agent AI Systems Are the Future of Complex Task Automation" (Towards Data Science):** https://towardsdatascience.com/why-multi-agent-ai-systems-are-the-future-of-complex-task-automation — a practical treatment of the scalability argument with architecture patterns
