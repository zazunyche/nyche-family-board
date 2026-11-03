# AI Agents Day 35: Coordination Overhead and When NOT to Use Multi-Agent

**Day 35 of 50 | Mini-Module 2.2: Multi-Agent Systems**

---

## The Week in Review

This is the final snippet of Mini-Module 2.2. Over the last seven days, you've built a complete picture of multi-agent systems: why single agents hit limits (Day 28), the orchestrator/subagent pattern (Day 29), the Zazu+Abeiku live case study (Day 30), pipeline/fan-out/swarm topologies (Day 31), the minimum viable handoff principle (Day 32), trust chains and adversarial design (Day 33), and a full Earnventory supplier-monitoring architecture (Day 34).

Today is about when to pull back. Multi-agent is a powerful pattern — and it's also one of the most over-applied ones. Teams reach for it too early, too eagerly, and then pay for it in production. This lesson is about recognizing the hidden costs and knowing when a single agent with more tools is the right choice.

Tomorrow morning: the Mini-Module 2.2 quiz. Five questions. Reply via iMessage with your reasoning, not just your answers.

---

## The Costs Nobody Talks About

When you read about multi-agent systems, the literature emphasizes the benefits: parallelism, scale, specialization, context isolation. These are real. But the costs are equally real, and they compound in ways that catch teams off guard when they move from prototype to production.

### Cost 1: Latency Multiplies at Every Hop

Every time your orchestrator calls a subagent, it makes a full round-trip to the language model:

- Network time to the API
- Queue time under load
- Model inference time (several hundred milliseconds to multiple seconds)
- Token generation time, proportional to output length
- Network time back

A single well-optimized agent turn runs roughly 1–5 seconds depending on output length and model tier. A three-agent pipeline — orchestrator calls analysis agent, analysis agent returns, orchestrator calls notification agent — is 3–15 seconds at minimum, assuming first-try success on every hop.

Now add internal tool calls. An orchestrator that calls an analysis subagent that makes 3 tool calls internally, then returns, and then the orchestrator calls a notification subagent that makes 2 tool calls... you're looking at 10+ model/tool interactions before the task completes.

```
Single agent workflow:
  Request --> [Agent: tools A + B + C] --> Response
  Latency:  1 model inference + N tool calls

Three-agent pipeline:
  Request --> [Orchestrator]
                  |
                  +--> [Analysis Agent: tool A + tool B]
                  |         |
                  |    <----+ (return)
                  |
                  +--> [Notification Agent: tool C]
                            |
                       <----+ (return)
                  |
              --> Response
  Latency:  3 model inferences + N tool calls per agent
```

In a user-facing product, the difference between 2 seconds and 12 seconds is the difference between "feels fast" and "seems broken." For scheduled overnight batch jobs, it means a 20-minute run becomes a 2-hour run.

### Cost 2: Errors Propagate and Amplify

In a single-agent system, if the agent makes an error, the error is contained. The agent sees its own reasoning and outputs in context, can sometimes self-correct, and the error surfaces clearly in the final output. You know what went wrong.

In a multi-agent system, errors propagate across context boundaries in ways that amplify them and obscure their origin:

- Agent A makes a factual error in its output (misclassifies a supplier invoice as "overdue")
- Agent B receives Agent A's output as a `tool_result` — structured data it treats as ground truth
- Agent B reasons correctly from a wrong premise (correctly calculates a penalty rate against an invoice that was actually current)
- The final output is confidently, coherently wrong — with no visible error signal at any stage

The insidious part: the reasoning at every step is valid. Agent A extracted what looked like a valid overdue date. Agent B calculated a penalty rate correctly. The output looks clean. Only the input to Agent A was wrong — and that error is now embedded in a chain of "correct" steps.

This is the trust chain problem from Day 33, now viewed through a production reliability lens. Every agent boundary is a place where a fact can enter unchallenged. The more agents in the chain, the more places errors can enter and compound before reaching the output.

### Cost 3: Context Management Multiplies

A single-agent system has one context window to manage. A three-agent system has three. Each one requires:

- System prompt engineering: role, constraints, output format, tool instructions
- Task-specific context: what does this agent need to know to do its job?
- Handoff data: what did the upstream agent return, and in what format?
- Tool definitions: which tools does this agent have access to?

Context engineering — deciding what goes on the whiteboard — is already a first-class engineering discipline for single agents (Day 14 covered this in detail). Multi-agent systems multiply that engineering burden by the number of agents. Each agent is a separate whiteboard, and someone has to decide what's written on each one.

Getting this wrong compounds. If the analysis agent's context doesn't include the right inventory fields, it returns incomplete analysis. If the notification agent's context includes too much raw data from upstream agents, it may prioritize the wrong things in its output. Every agent's context window is a place where the wrong information can be included (wasting tokens) or the right information can be excluded (causing errors).

### Cost 4: Token Costs Scale Non-Linearly

Every agent call consumes tokens: input tokens for the system prompt, tool definitions, conversation history, and handoff data — plus output tokens for the agent's response, reasoning, and tool calls.

In a three-agent pipeline, you pay for system prompts and tool definitions three times over. Assume each agent has:
- A 2,000-token system prompt
- 5 tool definitions at 400 tokens each (2,000 tokens)
- 500 tokens of shared context (the task brief)

That's 4,500 tokens of fixed overhead per agent, before any task-specific content. For three agents: 13,500 tokens of overhead on every run, regardless of how trivial the task.

For high-volume workflows — nightly batch processing of 1,000 supplier invoices, for example — this overhead is real money. At Sonnet's pricing, 13,500 tokens per run × 1,000 runs = 13.5 million tokens of pure structural overhead per night, before any actual work happens.

### Cost 5: Debugging Becomes Exponentially Harder

When a single-agent task fails, you have one conversation history to inspect. When a three-agent task fails, you have three context windows, three sets of tool calls and results, and inter-agent handoff data — and the failure may have originated in Agent 1, been amplified in Agent 2, and only surfaced in Agent 3's output.

Without good observability tooling (Mini-Module 2.4 covers this), debugging a multi-agent failure is like debugging a distributed microservice failure: the error is far from its cause, and reconstructing the chain of events requires logging everything at every boundary. Teams that build multi-agent systems without this observability infrastructure routinely ship bugs that are nearly impossible to reproduce.

---

## The Decision Framework

Before adding an agent boundary, answer three questions:

```
Do I genuinely need multi-agent?

1. True parallelism?
   Are there subtasks that are INDEPENDENT and can run SIMULTANEOUSLY?
   (Not just "conceptually distinct" -- actually able to run in parallel)

2. Context overflow?
   Does the task history genuinely EXCEED one context window?
   (Not "might get long" -- actually overflowing today)

3. Real specialization?
   Are the subtasks SO DIFFERENT they need different system prompts,
   different tools, or different model tiers?
   (Not "conceptually separate" -- genuinely different cognitive jobs)

If NONE are true --> Single agent with more tools.
If ANY are true --> Multi-agent is worth the overhead.
```

The key word throughout is "genuinely." The temptation is to over-modularize: to create a new agent for every conceptually distinct function. This is the same anti-pattern that leads to over-engineered software — abstraction for abstraction's sake.

In software, you wouldn't create a new class just because two operations are conceptually related. You'd wait until the complexity justifies the abstraction. The same discipline applies here.

---

## The Earnventory Test

Consider the morning invoice summary workflow: scan for supplier invoices received in the last 24 hours, calculate margin impact, send a summary email.

**The over-engineered version:**

```
ORCHESTRATOR
    |
    +--> Supplier Monitor Agent  (reads inbox, extracts invoices)
    |         |
    |    <----+ (PricingChangeEvent JSON)
    |
    +--> Margin Analyst Agent  (computes per-SKU impact)
    |         |
    |    <----+ (MarginImpactReport JSON)
    |
    +--> Notification Agent  (drafts and sends email)
              |
         <----+
```

What this buys you: zero. The task is sequential, not parallel. The context is small. There's no genuine specialization — one agent doing all three steps doesn't "lose quality" because the cognitive load is manageable. You've added three model calls, three system prompts to maintain, inter-agent schema definitions to design and validate, and three times the debugging surface.

**The right version:**

```
ONE AGENT with four tools:
  - search_gmail(query, days=1)
  - get_current_pricing(sku_id)
  - calculate_margin(cost, price)
  - send_email(to, subject, body)
```

One model call. One context window. One system prompt. N tool calls. The agent reads the inbox, looks up pricing, computes margin, and drafts the email — all in a single pass.

When would you actually reach for multi-agent here?

- **500 invoices to process simultaneously** — that's genuine parallelism; a fan-out pattern where 10 analysis agents each handle 50 invoices in parallel would be meaningfully faster.
- **Context overflow** — if you're accumulating weeks of supplier negotiation history and it genuinely exceeds the context window, you need external memory or multi-agent context isolation.
- **Genuinely different model tiers** — if the financial analysis requires Claude Opus for accuracy but the email drafting can be handled by Haiku at 1/30th the cost, agent separation pays for itself in token savings.

None of those conditions apply to a simple daily invoice summary. One agent with four tools is the right answer.

---

## The Coordination Tax

Here's a useful mental model: every agent boundary you add carries a coordination tax. That tax has five components:

| Component | What it costs |
|-----------|---------------|
| Handoff design | Engineering time: what JSON moves between agents, what the schema is, what error handling looks like |
| Latency | One extra model round-trip per agent in the chain |
| Error surface | One more place where a fact can enter the pipeline unchecked |
| Token overhead | System prompt + tool definitions paid again per agent |
| Debug complexity | One more context window to reconstruct when something breaks |

Before adding a boundary, the value of that boundary has to exceed its coordination tax. Most of the time, for most workflows at Earnventory's current scale, it doesn't. The value of specialization or isolation simply doesn't outweigh the overhead when a single agent with a good tool set can do the job.

---

## When Multi-Agent Genuinely Earns Its Keep

To be clear about what this lesson is not saying: multi-agent is not wrong. It's the right answer for the right problems. Here's an honest accounting:

```
Scenario                             | Single Agent | Multi-Agent
-------------------------------------|-------------|-------------
Sequential, bounded task             | Better      | Overkill
Task fits comfortably in one window  | Better      | Unnecessary
Latency-sensitive, user-facing       | Better      | Too slow
Genuinely parallel subtasks          | Bottleneck  | Better
Context genuinely exceeds one window | Fails       | Required
Different model tiers for subtasks   | Possible    | Cost-efficient
High-volume batch (>100 concurrent)  | Slower      | Better
Subtasks need true isolation         | Risky       | Cleaner
```

The pattern: multi-agent pays off when the work is big enough, parallel enough, or complex enough that the coordination tax is smaller than what you'd pay to cram everything into one context window or run tasks sequentially.

Most early-stage Earnventory agent workflows will be in the left column. That's not a limitation — that's appropriate scope. When you're processing 10 supplier invoices a day, the single-agent approach is faster, cheaper, and easier to debug. When you're processing 10,000 SKUs across 200 suppliers with parallel analysis and notification workflows, multi-agent earns its architecture.

The engineering judgment is knowing which situation you're in right now — not which situation you might be in at 100x scale.

---

## Synthesis: The Shape of Mini-Module 2.2

Here's what you've built over seven days:

**Day 28:** Why one agent isn't always enough — context exhaustion, complexity ceiling, the case for multi-agent when warranted.

**Day 29:** The orchestrator/subagent pattern — isolated context windows, instruction passing, the fundamental architecture.

**Day 30:** Zazu + Abeiku as a live case study — how orchestration works in the system you actually run.

**Day 31:** Pipeline, fan-out, swarm — three topologies for three types of work distribution.

**Day 32:** Minimum viable handoff — the principle that only necessary information crosses agent boundaries.

**Day 33:** Trust between agents — why trust chains are harder than trust between services, and how to design for adversarial environments.

**Day 34:** A concrete Earnventory multi-agent system — supplier monitor + pricing analyst + notifier, with full agent specs, tool definitions, and orchestrator logic.

**Day 35 (today):** When to pull back — the five hidden costs, the decision framework, and the engineering judgment to know when one agent with more tools is the better answer.

The thread running through all of it: multi-agent is an engineering tool, not a default. Use it when the problem justifies the overhead. Resist it when it doesn't.

---

## Free Resources

1. **Anthropic's multi-agent systems guide** — the canonical reference for orchestration patterns, context isolation, and how subagents are structured in the Claude Agent SDK. Worth re-reading now that you have a week of context behind you:
   https://platform.claude.com/docs/en/agents-and-tools/agents

2. **"Multi-Agent Orchestration: 5 Patterns That Work"** — practical taxonomy of when each multi-agent topology is appropriate, including concrete guidance on the single-agent vs. multi-agent decision for different scales and use cases:
   https://www.digitalapplied.com/blog/multi-agent-orchestration-5-patterns-that-work

---

*Day 35 of 50 | Mini-Module 2.2: Multi-Agent Systems | AI Agents Curriculum — Designed by Abeiku for Dad*
