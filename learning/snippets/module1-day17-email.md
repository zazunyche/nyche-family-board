# AI Agents Day 17: ReAct — The Loop That Makes Agents Smart
**How Reason → Act → Observe → Reason Turns a Language Model Into a Task Executor**

*Module 1.4, Day 17 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | July 3, 2026*

---

## The Short Version

Chain-of-thought (CoT) from Day 16 gives the model explicit reasoning before it answers. ReAct extends that idea to action-taking agents: the model reasons, takes an action, observes what came back, and reasons again — cycling until the task is complete. This Reason → Act → Observe loop is the standard architecture for task-executing agents, and it's the pattern running underneath Zazu every time a task requires more than one tool call. Understanding it in detail tells you why agents succeed, why they fail, and how to design tasks and tools so the loop terminates correctly.

---

## Why CoT Alone Isn't Enough for Agents

CoT is powerful when the model has all the information it needs in context. Ask it to calculate margin after a tariff change and it can reason through the steps without needing to reach outside itself. But real tasks require information that doesn't exist in the context at the start of the conversation:

- The contents of emails that arrived today
- The current price of a SKU in a database
- Whether an invoice was paid last Tuesday
- The result of a calculation that depends on live exchange rates

For these tasks, the model has to *act* — call a tool, retrieve information — and then incorporate what it gets back into the next step of its reasoning. A pure CoT approach with all information pre-loaded doesn't scale: you'd have to retrieve every potentially relevant fact and dump it into the context before the model even starts, which is expensive, slow, and often impossible because you don't know what facts you'll need until you've started reasoning.

ReAct solves this by interleaving reasoning and action: reason to figure out what you need, act to get it, observe what you got, reason again with the new information.

---

## The Pattern

The ReAct loop has three components that repeat until the task is complete:

```
╔══════════════════════════════════════════════════════════════════════╗
║                        THE REACT LOOP                               ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║   ┌─────────────────────────────────────────────────────────────┐   ║
║   │  REASON                                                     │   ║
║   │  "What do I know? What do I need? What's my next step?"     │   ║
║   │  The model generates explicit reasoning tokens.             │   ║
║   │  These constrain the action it chooses next.                │   ║
║   └────────────────────────────┬────────────────────────────────┘   ║
║                                │                                     ║
║                                ▼                                     ║
║   ┌─────────────────────────────────────────────────────────────┐   ║
║   │  ACT                                                        │   ║
║   │  The model emits a tool_use block: tool name + parameters.  │   ║
║   │  Your application executes it and returns the result.       │   ║
║   └────────────────────────────┬────────────────────────────────┘   ║
║                                │                                     ║
║                                ▼                                     ║
║   ┌─────────────────────────────────────────────────────────────┐   ║
║   │  OBSERVE                                                    │   ║
║   │  The tool result is appended to the context as a           │   ║
║   │  tool_result block. The model now "sees" what happened.     │   ║
║   └────────────────────────────┬────────────────────────────────┘   ║
║                                │                                     ║
║                          ┌─────▼──────┐                             ║
║                          │  Done?     │                             ║
║                          │  If no:    ├──→ back to REASON           ║
║                          │  If yes:   ├──→ final response           ║
║                          └────────────┘                             ║
╚══════════════════════════════════════════════════════════════════════╝
```

The loop terminates when the model's Reason step decides it has enough information to give a final answer — at which point it sets `stop_reason: end_turn` instead of emitting another tool call.

What's critical to understand: the Observe step isn't passive. Each tool result is appended to the conversation context, so every subsequent Reason step is conditioned on the cumulative history of all prior reasoning, actions, and observations. The model isn't "forgetting" what happened two steps ago — it's all in the context window, shaping what comes next.

---

## A Concrete Trace: Zazu + Supplier Emails

Let's trace a real Zazu task from start to finish: *"Find all unread emails from suppliers this week and give me a summary of anything actionable."*

At the start, Zazu's context contains the system prompt and the user message. It knows nothing about what emails exist. Here's what the ReAct loop looks like:

```
═══════════════════════════════════════════════════════════════════════
TURN 1
═══════════════════════════════════════════════════════════════════════

REASON:
"The user wants unread supplier emails from this week. I know the
 supplier domain list from my system context. I'll search Gmail
 for unread messages from those domains since Monday 2026-06-29.
 I should start broad and filter rather than over-specifying the query."

ACT:
tool_use: search_gmail
  query: "is:unread (from:acme-supply.com OR from:globaltex.net OR
          from:pacrim-logistics.com) after:2026/06/29"

OBSERVE (tool_result):
  3 threads returned:
  - Thread A: "Invoice #4421 — June 2026" (Acme Supply, June 30)
  - Thread B: "Shipping update: container GX-7721" (GlobalTex, July 1)
  - Thread C: "IMPORTANT: Price adjustment effective Aug 1" (PacRim, July 2)

═══════════════════════════════════════════════════════════════════════
TURN 2
═══════════════════════════════════════════════════════════════════════

REASON:
"I have three results. Thread C is time-sensitive — a price adjustment
 announcement is the most actionable item. Thread A is an invoice —
 important but routine. Thread B is a shipping update — likely FYI.
 I should fetch the full body of Thread C first to understand scope,
 then Thread A to get the invoice amount, then Thread B briefly."

ACT:
tool_use: get_email_thread
  thread_id: "Thread C"

OBSERVE (tool_result):
  From: procurement@pacrim-logistics.com
  Subject: IMPORTANT: Price adjustment effective Aug 1
  Body: "Dear Customer, due to increased fuel surcharges, we are
         adjusting freight rates for all shipments effective August 1.
         Container rates will increase 12%. LTL rates up 8%.
         Please contact your account manager if you'd like to lock
         in current rates before July 15."

═══════════════════════════════════════════════════════════════════════
TURN 3
═══════════════════════════════════════════════════════════════════════

REASON:
"This is significant. 12% container rate increase and a July 15
 deadline to lock in current rates. That's 12 days away. I should
 also get Thread A (the invoice) to complete the picture before
 summarizing. Thread B (shipping update) can be mentioned briefly
 without full retrieval."

ACT:
tool_use: get_email_thread
  thread_id: "Thread A"

OBSERVE (tool_result):
  From: ar@acme-supply.com
  Subject: Invoice #4421 — June 2026
  Body: Invoice for $14,240.00, due July 15, 2026.
        [standard payment terms]

═══════════════════════════════════════════════════════════════════════
TURN 4
═══════════════════════════════════════════════════════════════════════

REASON:
"I now have enough. I have two time-sensitive items both due July 15:
 the invoice from Acme ($14,240 due) and the PacRim rate-lock deadline.
 The shipping update is informational. I have enough to produce the
 summary the user asked for. I don't need to fetch Thread B in full."

FINAL RESPONSE (stop_reason: end_turn):
"Three supplier emails this week — two are time-sensitive:

 1. **PacRim Logistics (July 2) — ACTION REQUIRED by July 15:**
    Freight rate increase effective Aug 1. Container rates up 12%,
    LTL rates up 8%. You can lock in current rates by contacting
    your account manager before July 15.

 2. **Acme Supply (June 30) — Payment due July 15:**
    Invoice #4421 for $14,240.00.

 3. **GlobalTex (July 1) — FYI:**
    Shipping update on container GX-7721. No action required."
═══════════════════════════════════════════════════════════════════════
```

Notice what happened: the model chose not to fetch Thread B in full because its Reason step in Turn 4 determined it had enough information. That's the loop making an intelligent decision — not every task requires the maximum number of possible tool calls. The model reasoned its way to "done" rather than mechanically fetching every available email.

---

## Why "Observe" Is Load-Bearing

The Observe step is the most underappreciated part of ReAct. It's not just "getting results back." Here's what it's doing architecturally:

Every tool result is appended to the context as a `tool_result` message. When the model enters its next Reason step, it is literally conditioning on all prior reasoning, actions, and observations. The observation doesn't inform the model — it *becomes part of the input* for every subsequent token the model generates.

This means:

**Observations constrain subsequent reasoning the same way CoT steps constrain subsequent generation.** If the observation says "3 emails returned," the next Reason step will necessarily reference what those 3 emails are, because that text is now in the input sequence.

**Observations can redirect the plan.** If Zazu's search returned 0 emails, the Reason step after that observation would pivot — maybe the query was too narrow, maybe no emails arrived, maybe the supplier domain list is incomplete. The observation changes the next reasoning step's input, which changes the action chosen.

**Observations can terminate the loop early.** If a tool returns "no results," the model may decide the task is complete (there's nothing to report) rather than continuing to search. The observation drives the termination decision as much as the reasoning does.

---

## Comparing ReAct to the Alternatives

It helps to see ReAct against the two patterns it improves on:

```
PURE ACTING (no explicit reasoning)
═══════════════════════════════════════════════════════════════════════
Task → Tool call → Tool call → Tool call → Answer
         ↑
No reasoning step. Model is pattern-matching from task to actions.
Hard to debug. No audit trail. No self-correction.
Coherence degrades on multi-step tasks.
═══════════════════════════════════════════════════════════════════════

PURE COT (no action loop)
═══════════════════════════════════════════════════════════════════════
Task → Reason → Reason → Reason → Answer
         ↑
Good for tasks where all information is already in context.
Fails when the task requires external information.
Can't take action. Can't update on observations.
═══════════════════════════════════════════════════════════════════════

REACT (reasoning + acting, interleaved)
═══════════════════════════════════════════════════════════════════════
Task → R → Act → Observe → R → Act → Observe → R → Answer
         ↑         ↑          ↑
       plan      update     update
    from        from obs   from obs
    context
Handles external information. Audit trail. Self-correction possible.
Works for tasks of arbitrary complexity (bounded by context).
═══════════════════════════════════════════════════════════════════════
```

ReAct is better than pure acting because the explicit Reason step produces an audit trail: you can see what the model intended before it called the tool. If it calls the wrong tool, you know it reasoned its way to the wrong choice — and you can fix the reasoning prompt or tool description accordingly.

ReAct is better than pure CoT for action-taking tasks because the observation loop allows the model to incorporate new information rather than reasoning in a vacuum. It's the difference between solving a math problem with all the numbers given vs. solving a problem where you have to look up some of the numbers mid-calculation.

---

## Failure Modes Specific to ReAct

Understanding the loop also tells you where it breaks:

**Reasoning drift.** Over many turns, the model's Reason step may drift from the original task. It starts reasoning about a side observation ("that invoice date is unusual — maybe I should check payment history") and loses track of the original goal. Fix: include the original task objective in every system prompt turn, or have the model explicitly restate the goal at the start of each Reason step.

**Observation truncation.** If a tool returns a very long result and you truncate it to fit in the context window, the Reason step that follows is conditioned on an incomplete observation. The model may proceed as if the full result was there. Fix: return structured summaries from tools rather than raw full content; do the truncation intelligently at the tool layer, not the context layer.

**Infinite loops.** The model may keep calling the same tool with minor variations, not recognizing that it's already retrieved the relevant information. Fix: include a max-iterations safeguard in your agentic loop at the application layer — your code counts turns and terminates gracefully after a configurable limit, regardless of what the model would have done next.

**Over-fetching.** The model fetches more data than it needs, spending token budget and latency on observations that don't change the final output. Fix: tool descriptions should be specific about what each tool returns, so the model can reason about whether the result will be useful before calling.

**Trust without verification.** The model may reason as if an observation is authoritative when it's an estimate or could be stale. Fix: design tools to return metadata about data freshness and confidence, and instruct the model to surface uncertainty rather than smooth it over.

---

## ReAct in Earnventory Terms

Almost every non-trivial Earnventory agent task is a ReAct task. Here's a sample:

**Task:** "Check whether we're at risk of stockouts on any fast-moving SKUs before the July 4th weekend."

```
R: "I need current stock levels and recent sales velocity.
    I'll query inventory first, then filter to fast-moving SKUs."
A: get_inventory_levels(threshold="reorder")
O: 8 SKUs below reorder point; 3 flagged as fast-moving.

R: "Three fast-movers are below reorder. I need their average
    daily sales rate to estimate days-of-stock remaining."
A: get_sales_velocity(sku_ids=[SKU-A, SKU-B, SKU-C], days=14)
O: SKU-A: 18/day; SKU-B: 7/day; SKU-C: 31/day

R: "Days of stock: SKU-A = 4d, SKU-B = 9d, SKU-C = 2d.
    With a 3-day holiday weekend, SKU-C is likely to stock out
    mid-weekend and SKU-A by end of weekend. I should check
    supplier lead times for these two before recommending action."
A: get_supplier_lead_time(sku_ids=[SKU-A, SKU-C])
O: SKU-A: 5 business days; SKU-C: 3 business days.

R: "Both lead times exceed days of stock. Emergency orders would
    arrive after the risk window. I have enough to make a
    recommendation — flag SKU-C as critical, SKU-A as urgent."

FINAL: "Two SKUs at stockout risk before July 4th weekend: ..."
```

Compare this to trying to answer that question with a single tool call or with no explicit reasoning. The multi-step observation loop is what makes the analysis coherent and the recommendation trustworthy. Each observation updates the risk assessment rather than requiring all the information upfront.

---

## The Academic Origin (Worth Knowing)

ReAct was formalized in a 2022 paper by Yao et al. (Google Brain / Princeton): *"ReAct: Synergizing Reasoning and Acting in Language Models."* The key finding was that interleaving reasoning traces with action execution significantly outperformed either reasoning alone (pure CoT) or acting alone on multi-step benchmarks. The name is a portmanteau: **Re**asoning + **Act**ing.

The paper also noted an important safety property: because the reasoning trace is explicit, it's interpretable. You can inspect why the model chose a particular action — something that pure acting (no reasoning trace) doesn't give you. For production systems, that interpretability is worth as much as the accuracy improvement.

Claude's implementation of agentic behavior follows this pattern. When you see Claude calling multiple tools in sequence within a single task, each tool call is preceded by implicit or explicit reasoning and followed by the model incorporating the result before choosing the next action.

---

## What's Next

Tomorrow: **Claude's "think" tool and extended thinking mode.** What actually happens architecturally when Claude is given a dedicated reasoning budget before responding? How is this different from standard CoT and the visible ReAct reasoning traces? What does it cost in tokens and latency, and when is it worth it? This is Day 18.

The **Mini-Module 1.4 quiz** will come separately after Day 19 (the final snippet of this mini-module). It covers CoT mechanics, the ReAct loop, extended thinking, and planning vs. reactive execution.

---

## Free Resources

1. **"ReAct: Synergizing Reasoning and Acting in Language Models" (Yao et al., 2022)**
   The original paper introducing the ReAct pattern. Section 2 defines the pattern; Section 3 shows the benchmark improvements over CoT-only and act-only baselines. The HotpotQA and ALFWorld examples in the appendix are especially clear. Free on arXiv.
   https://arxiv.org/abs/2210.03629

2. **Anthropic's "Building Effective Agents" guide**
   Anthropic's practical documentation on agent design patterns — covers the agentic loop, tool use, multi-step workflows, and how these map to the Claude API. This is the practitioner counterpart to the ReAct paper: less theory, more implementation detail. Directly applicable to Earnventory.
   https://www.anthropic.com/research/building-effective-agents

---

## One Sentence to Carry Forward

ReAct works because each Observe step doesn't just inform the next action — it becomes part of the model's input, so every subsequent Reason step is conditioned on the full cumulative history of what was tried and what came back, making the agent's trajectory coherent in a way that pure reasoning or pure acting cannot achieve alone.

---

*Day 17 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.4: Reasoning and Planning — Day 2 of 4*
