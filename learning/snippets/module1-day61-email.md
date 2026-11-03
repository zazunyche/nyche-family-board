# AI Agents Day 61: ReAct — The Loop That Makes Agents Smart

**Mini-Module 1.4 — Reasoning and Planning | Day 61 of the Nyche AI Curriculum**

---

## Where We Are

Days 59 and 60 established the full picture of chain-of-thought: when it works, when it backfires, and how to elicit the shape of reasoning you actually want. The theme was that reasoning is a tool with a use condition — not a universal upgrade.

Today we go one architectural level up. What happens when you interleave that reasoning with real actions in the world, and let each observation reshape the next reasoning step?

That is the **ReAct pattern** — arguably the most important architectural idea in applied agent design. It's named for exactly what it does: **Re**asoning + **Act**ing, alternating in a cycle. It's not a prompting technique. It's a loop structure that defines how agents navigate real, changing environments.

---

## The Problem ReAct Solves

Start with a concrete task: "Check whether any Earnventory suppliers have sent invoices in the last 7 days and flag any over $10,000."

There are two architectural approaches:

**Plan-then-execute (no ReAct):**
The agent reasons about the task upfront, generates a complete plan, then executes every step in sequence. The plan is committed before any real information arrives.

This works for predictable, closed-world tasks. It fails when the world doesn't cooperate: what if the search returns nothing? What if one supplier has three invoices that are each under $10K but cumulatively significant? What if the most important invoice has an irregular subject line the search missed?

The agent planned against a hypothesis. It has no mechanism to update.

**ReAct:**
The agent alternates between generating a reasoning step and taking one action. After each action, it observes the real result and reasons again from that new information before deciding the next action.

This sounds incremental, but the architectural consequence is significant: the model's reasoning context includes **actual observation data from the world**, not just its prior beliefs. Every observation narrows and updates the next decision. The plan is perpetually current because it's continuously rebuilt from what was just found.

---

## A Complete ReAct Trace

Here is the full loop for the invoice task, written out explicitly:

```
TASK: "Check if any suppliers sent invoices >$10K in the last 7 days.
       Flag and summarize."

─────────────────────────────────────────────────────────
REASON: I need to retrieve recent supplier emails.
        I'll search for invoice-related messages from the
        past 7 days.
─────────────────────────────────────────────────────────
ACT:    search_emails(query="invoice", from_days_ago=7)
─────────────────────────────────────────────────────────
OBSERVE: 3 results found:
  - Supplier A (Acme Parts):       $4,200  — 2026-08-21
  - Supplier B (Delta Materials):  $12,500 — 2026-08-23
  - Supplier C (Folio Packaging):  $800    — 2026-08-24
─────────────────────────────────────────────────────────
REASON: Supplier B (Delta Materials) at $12,500 exceeds the
        $10K threshold. Before flagging, I should check
        whether this is a recurring expected invoice or
        something new. The history will tell me.
─────────────────────────────────────────────────────────
ACT:    get_invoice_history(supplier="Delta Materials",
                            lookback_days=90)
─────────────────────────────────────────────────────────
OBSERVE: Prior invoices:
  - May:  $11,200
  - June: $10,800
  - July: $9,500
  Pattern: monthly, slightly escalating.
─────────────────────────────────────────────────────────
REASON: This is a recurring monthly invoice trending upward.
        Still exceeds $10K threshold — flag it, but include
        context that the increase is ~$1K from last month,
        not anomalous.
─────────────────────────────────────────────────────────
ACT:    create_flag(supplier="Delta Materials",
                   amount=12500,
                   note="Recurring invoice; ~$1K above July")
─────────────────────────────────────────────────────────
OBSERVE: Flag created. ID: FLAG-20260825-001
─────────────────────────────────────────────────────────
REASON: All three suppliers checked. One flag created.
        Ready to compose the summary.
─────────────────────────────────────────────────────────
ACT:    compose_summary(
          flagged=["Delta Materials / $12,500 (recurring, +$1K)"],
          clean=["Acme Parts / $4,200", "Folio Packaging / $800"]
        )
─────────────────────────────────────────────────────────
OBSERVE: Summary composed.
DONE.
```

Notice the decision at the second reasoning step. The agent chose to look up invoice history *after* seeing that the amount was over $10K — not because it planned this upfront, but because the observation triggered a new question: is this expected or anomalous? ReAct gave it room to ask.

---

## How ReAct Differs from Chain-of-Thought

Chain-of-thought keeps reasoning *inside* the model's generation. The scratchpad helps the model decompose a problem, but it never touches the world. Every token is generated from context, not from reality.

ReAct interleaves generation and execution:

```
Chain-of-thought:

  [reason] → [reason] → [reason] → [answer]
              (all tokens, no external data)


ReAct:

  [reason] → [act] → [observe] → [reason] → [act] → [observe] → [done]
                         ^                      ^
                  real data arrives        updates reasoning
```

The distinction matters at scale. Chain-of-thought is the right tool when all the information needed is already in context — the model just needs to reason carefully over it.

ReAct is the right tool when the agent has to *discover* what it needs. Discovery requires touching the world. And touching the world changes what the agent should think next. Those two facts together are what make ReAct the dominant pattern in production agent systems.

---

## You've Already Seen ReAct in Practice

You've been watching ReAct run every time I process a multi-step task. Here's what the morning digest loop actually looks like structurally:

```
REASON: Check email for overnight messages.
ACT:    search_emails(query="unread", hours=8)
OBSERVE: 12 unread. 2 supplier emails, 1 calendar invite, 9 newsletter.

REASON: Supplier emails are priority. Read those first.
ACT:    get_message(id="supplier-001")
OBSERVE: Delta Materials — Q4 price increase notice, effective Oct 1.

REASON: This affects Earnventory margins directly. Flag as high priority.
ACT:    add_to_digest(priority="high",
                     summary="Delta: Q4 price increase notice")

REASON: Read second supplier email.
ACT:    get_message(id="supplier-002")
...
```

The reasoning and acting happen inside the agentic turn — you see the digest output, not the trace. But the structure is there. Each observation determines the next move. That's ReAct.

---

## Three Failure Modes to Know

ReAct is not infallible. Here are the three failure modes that appear most often in production:

**1. Observation overload.** If a tool returns hundreds of results, the observation floods the context. The next reasoning step degrades because the model is reasoning over noise rather than signal. Fix: design tools to return filtered, summarized output — not raw data dumps. The tool's job is to return *what's relevant*, not everything it has.

**2. Infinite loops.** An agent can get stuck: reason that it needs more information → call a tool → observe ambiguous output → reason that it still needs more information → ... indefinitely. Fix: set explicit termination conditions — maximum iteration count, explicit done-signals in tool responses, or a fallback instruction: "After 5 tool calls, summarize what you have and stop."

**3. Compounding errors.** A wrong observation (from a bad tool call, a parsing error, or stale upstream data) becomes a wrong reasoning input, which becomes a wrong action. The model doesn't inherently distrust its own observations — it treats them as ground truth. Fix: design tool handlers to return explicit, structured error states rather than empty results. An empty `[]` from a search looks like "nothing found" — but a `{"status": "error", "reason": "timeout"}` gives the model something to reason about.

---

## ReAct vs. Upfront Planning: When to Use Which

Mini-Module 1.4 will go deep on planning as a distinct mode. For now, the heuristic:

```
Use ReAct when:                        Use upfront planning when:
──────────────────────────────         ──────────────────────────────────
The task outcome depends on            The task structure is fully known
what you find in the world             in advance

Intermediate results change            Steps are sequential with no
what the next step should be           conditional branching

The task is exploratory by             Failure in one step makes
nature — you can't fully               all subsequent steps moot
specify it in advance
```

For Earnventory: anything that touches live data — supplier emails, current inventory levels, real-time pricing — benefits from ReAct. The world changes, so the plan should change based on what's found.

Generating 500 product descriptions from a fixed template? Plain chain-of-thought is fine — the task structure is identical for every SKU.

The meta-rule: if the task requires the agent to *discover* information before it can decide what to do with it, ReAct is the pattern.

---

## Why This Pattern Became the Default

The ReAct pattern was formalized in a 2022 paper by Yao et al. ("ReAct: Synergizing Reasoning and Acting in Language Models"). The core empirical finding was that combining reasoning *with* acting outperformed both pure reasoning (chain-of-thought without tools) and pure acting (tool calls without a reasoning scratchpad) across multiple benchmarks — including multi-hop question answering and interactive decision-making tasks.

The mechanism makes sense in retrospect: reasoning traces help the model generate more targeted, useful actions (it knows *why* it's calling a tool, so it calls it better). Observations help the model revise its reasoning rather than doubling down on prior assumptions. They reinforce each other.

This is now the default loop structure in production agent frameworks — LangGraph, AutoGen, the Claude Agent SDK — and in the agentic loop that runs in Claude Code. When I handle a multi-step task for you, this is the loop that's running. It's not exotic; it's the baseline.

---

## What to Watch For Today

Next time you give me a task that involves checking something — emails, calendar, inventory — watch the structure of what I do:

- Short reasoning statements that explain *why* the next action is needed
- Tool calls that retrieve real data
- Subsequent reasoning steps that explicitly reference what was just found, not just what was assumed

That's ReAct. And when you build agents for Earnventory, this is the loop you'll implement. Not a single call-and-respond, not a plan-then-execute batch — but reason, act, observe, reason again, until the task resolves.

---

**Free Resources:**
- ReAct paper and demo: https://react-lm.github.io/ — the original research with interactive examples
- Anthropic's agentic loop overview (how Claude implements this): https://docs.anthropic.com/en/docs/build-with-claude/agents

---

*AI Agents curriculum by Abeiku | Delivered by Zazu | Day 61 of 50 — Mini-Module 1.4: Reasoning and Planning*
