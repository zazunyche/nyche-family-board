# AI Agents Day 54: ReAct — The Loop That Makes Agents Smart

**Mini-Module 1.4 — Reasoning and Planning | Day 2 of 4**

---

Yesterday we covered chain-of-thought: forcing the model to generate intermediate reasoning tokens before producing a final answer, so each step constrains the next and errors become visible before they compound.

ReAct extends this into a *loop* — not just reasoning before answering, but reasoning before acting, observing the result, and reasoning again. The name is a portmanteau: **Re**asoning + **Act**ing. This is the pattern that powers every agentic task Zazu runs, every time it reaches out and touches the world.

---

## What ReAct Is

The pattern, per iteration:

1. **Reason** — Generate a thought about what to do next and why
2. **Act** — Take an action (call a tool, retrieve data, write a file)
3. **Observe** — Receive and interpret the result
4. Repeat from step 1 until the task is done

Without the Act and Observe steps, you have chain-of-thought: useful reasoning, but the model stays inside its own head. With them, it can gather information it didn't have at the start, revise its plan based on what it finds, and take real-world actions with real consequences.

The key architectural insight: **plans are provisional, and reasoning is continuous.** The model doesn't commit to a complete plan at the start. It commits to a single next action, observes what happens, and then decides what to do next.

---

## Tracing ReAct Through a Concrete Task

Let's trace the full loop for something Zazu actually does: **"Check if any Earnventory suppliers sent invoices in the last 7 days and summarize what's outstanding."**

This can't be answered from context alone — it requires looking up real data. Here's what the internal loop looks like:

```
TASK: "Check supplier invoices from the last 7 days"
──────────────────────────────────────────────────────────────────

[Thought 1]
I need to search email for supplier invoices. I'll use search_email
with invoice-related keywords and a 7-day window.

[Action 1]
search_email(query="invoice", days=7)

[Observation 1]
3 results:
  • mensah-trading.com  — "Invoice #MT-2024-089"
  • globalfresh.net     — "August Invoice — GlobalFresh"
  • pacificrim.co       — "Reminder: Invoice #PR-441"

[Thought 2]
Three matches. The Pacific Rim subject says "Reminder" — could be a
re-send of an older invoice, not a new one. I'll check all three to
get amounts and due dates.

[Action 2]
get_email(id="mensah-trading-089")

[Observation 2]
Invoice #MT-2024-089. Amount: $4,200. Due: September 1. First notice.

[Action 3]
get_email(id="globalfresh-aug")

[Observation 3]
August Invoice. Amount: $1,800. Due: August 30. First notice.

[Action 4]
get_email(id="pacificrim-441")

[Observation 4]
Invoice #PR-441. Amount: $2,950. Due: August 22 — OVERDUE by 24 days.
Original invoice sent July 23. This is a reminder.

[Thought 3]
I now have complete data. Two new invoices and one overdue reminder.
Pacific Rim requires immediate attention. I can summarize with
priority ordering.

[Final Answer]
3 supplier invoices in the last 7 days:

  OVERDUE (act now):
  • Pacific Rim Goods  — $2,950 — Due Aug 22 (24 days overdue)

  UPCOMING:
  • GlobalFresh        — $1,800 — Due Aug 30
  • Mensah Trading     — $4,200 — Due Sep 1

  Total outstanding: $8,950
──────────────────────────────────────────────────────────────────
```

Notice what happened at Thought 2: the model updated its plan mid-task. It noticed the "Reminder" subject line and added an inference — "may be a re-send of an older invoice." That inference proved correct at Observation 4. The model didn't have to plan for this contingency upfront. It reasoned about it when the evidence arrived, and the evidence shaped the next step.

This is ReAct working as intended.

---

## Why Not Just Plan Upfront?

A naive alternative: ask the model to generate a complete plan first, then execute each step in order.

1. Generate plan: "Search email, then open each result, then summarize"
2. Execute blindly

This works for simple, predictable tasks. It fails when the world doesn't cooperate — which is most real tasks.

In the invoice example, a pure planner might commit to "open the top 3 results." But what if the search returned 12? Or 0? What if one result was a newsletter that matched "invoice" accidentally? A rigid plan can't adapt. ReAct can, because it generates its next step *after* seeing the result of the last one.

```
PLANNING-ONLY:
────────────────────────────────────────────────────
Plan: Step 1 → Step 2 → Step 3 → Answer

Problem: If Step 2's output doesn't match the plan's
assumptions, the model either proceeds incorrectly
or breaks entirely.
────────────────────────────────────────────────────

ReAct:
────────────────────────────────────────────────────
Thought → Act → Observe → (adjust) → Thought → Act → ...

Each observation can reshape the plan. The model
re-plans after every single action.
────────────────────────────────────────────────────
```

This is also why ReAct tends to produce better tool use than pure planning. The model can call a tool, see the result, realize it needs a different approach, and pivot — rather than committing to a fixed tool-call sequence at the outset.

---

## The ReAct Loop at the API Level

Every time Zazu runs an agentic task, this is the code structure underneath it:

```python
while True:
    response = client.messages.create(
        model="claude-sonnet-4-6",
        system=SYSTEM_PROMPT,
        messages=messages,
        tools=TOOLS,
        max_tokens=4096
    )

    if response.stop_reason == "end_turn":
        # Model finished reasoning — task complete
        break

    elif response.stop_reason == "tool_use":
        # Model wants to act — execute the tool calls
        tool_calls = [b for b in response.content if b.type == "tool_use"]
        tool_results = []

        for call in tool_calls:
            result = execute_tool(call.name, call.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": call.id,
                "content": result
            })

        # Append the model's action and the tool results, then loop
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})
```

Each pass through this loop is one Reason-Act-Observe cycle:

- The model's generated text before the `tool_use` block = **Reason**
- The `tool_use` block itself = **Act**
- The `tool_result` you append = **Observe**

`stop_reason == "tool_use"` means: keep going, the model has more to do.
`stop_reason == "end_turn"` means: the model is satisfied, the task is complete.

This loop — trivial to write, powerful in practice — is the engine underneath every agent you'll build.

---

## Where ReAct Fails

Understanding the failure modes is as important as understanding the pattern.

**Infinite loops.** If an action always returns an error or an unexpected result, the model may keep retrying the same approach without recognizing it's stuck. Production systems impose a maximum iteration count (`max_iterations = 20`, for example) and break out if exceeded. Zazu does this.

**Context exhaustion.** Each Reason-Act-Observe cycle adds tokens to the context — the model's reasoning text, the tool call block, the tool result. On long multi-step tasks, the context window fills up. This is why context compaction strategies matter (Mini-Module 1.3): you need a way to compress the growing history without losing the information the model needs to continue.

**Bad data propagating forward.** ReAct trusts tool results. If your `search_email` handler has a bug and returns stale data, the model reasons on top of that bad data — confidently. It won't verify the tool's output independently. Garbage in, coherent reasoning about garbage out.

**Goal drift.** On very long ReAct chains with many observations, the model can drift from its original task, especially if the initial task description was vague. The original goal gets "diluted" by subsequent context. Explicit goal reminders in the system prompt and concise, well-specified tasks mitigate this.

---

## ReAct vs. Chain-of-Thought

These aren't alternatives — they're layers.

```
CHAIN-OF-THOUGHT:
─────────────────────────────────────────────────
Think step-by-step → Answer

Stays inside the model. No tools.
Good for reasoning tasks: math, analysis, planning.
Terminates in one pass.
─────────────────────────────────────────────────

ReAct:
─────────────────────────────────────────────────
Think → Act → Observe → Think → Act → Observe → ...

Reaches out and touches the world. Requires tools.
Good for information-gathering and multi-step execution.
Terminates when the model decides the task is done.
─────────────────────────────────────────────────

In practice:
─────────────────────────────────────────────────
CoT is what happens *inside* each Thought step of ReAct.

The model reasons about what action to take (CoT),
takes the action (ReAct Act step),
reasons about what the result means (CoT again),
decides what to do next (ReAct cycle repeats).
─────────────────────────────────────────────────
```

Most real agent tasks use both continuously. ReAct is the outer loop; CoT is the inner discipline that makes each reasoning step worth trusting.

---

## Applied to Earnventory

Think about what a supplier negotiation agent would need to do:

1. Retrieve the supplier's last 3 purchase orders
2. Check current market prices for those SKUs
3. Calculate what margin looks like at the current rate vs. a renegotiated rate
4. Draft a response with a counter-offer

No single step can be planned upfront with certainty — the market price lookup might fail, the purchase history might show irregular volumes that change the calculus, the counter-offer might need to be conditional on a minimum order quantity you retrieve from a separate system.

ReAct handles this naturally. A pure planning approach would require you to anticipate every branching possibility and code handlers for each. With ReAct, the model adapts as it goes — as long as the tools are well-designed and the task is clearly specified.

The engineering work is designing good tools and a clear system prompt. The reasoning and adaptation happen automatically in the loop.

---

## The Analogy

**The scientific method applied to every agent turn.**

A scientist doesn't design an entire experiment upfront and execute it blindly. They form a hypothesis (Reason), run an experiment (Act), look at the data (Observe), and form a revised hypothesis (Reason again). If the data is surprising, the next experiment may be completely different from what was originally planned.

Good scientists let the evidence reshape the plan. ReAct does the same thing, applied to every step an agent takes. The task specification is the research question. The tools are the experimental apparatus. The observations are the data. The loop ends when the model concludes it has enough evidence to answer — not when it runs out of pre-planned steps.

The difference between a rigid planner and a ReAct agent is the difference between a scientist who runs exactly the experiment they designed, regardless of what the data says, and one who follows the evidence wherever it leads. One produces reliable results on simple, predictable problems. The other handles the real world.

---

## What's Next

Tomorrow: **Claude's extended thinking mode** — what happens when the reasoning scratchpad is hidden from the output entirely. The model thinks in a private buffer that never enters the visible context window. We'll cover what this does to latency, token cost, and reasoning quality — and when the tradeoff is worth it.

---

## Free Resources

- **"ReAct: Synergizing Reasoning and Acting in Language Models" (Yao et al., 2022):** https://arxiv.org/abs/2210.03629 — The paper that named the pattern. Section 3 has clear worked examples. The failure analysis in Section 4 maps directly to the failure modes covered above — worth reading before building anything production-grade with this pattern.

- **Anthropic's "Building Effective Agents" guide:** https://www.anthropic.com/research/building-effective-agents — Anthropic's own framing of ReAct and related patterns, with practical guidance on when to use each. The section on orchestrator-subagent patterns connects directly to what you'll see in Mini-Module 2.2.
