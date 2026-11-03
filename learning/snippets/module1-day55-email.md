# AI Agents Day 55: Claude's Extended Thinking Mode

**Mini-Module 1.4 — Reasoning and Planning | Day 55 of the Nyche AI Curriculum**

---

## What We're Covering Today

Yesterday you saw ReAct — the Reason → Act → Observe loop that turns chain-of-thought into an action-grounded cycle. Today we go one layer deeper into the reasoning architecture itself.

Chain-of-thought (Day 53) and ReAct (Day 54) are both about *visible* reasoning: the model produces intermediate steps that appear directly in its response. Extended thinking is different. The scratchpad is *hidden* — generated before the response, used to anchor it, but separated into its own content block that most end-users never see.

Understanding the architectural difference between these three reasoning modes is essential for knowing when to deploy each one — and what you're paying for when you do.

---

## The Three Reasoning Modes, Compared

```
MODE             WHERE REASONING LIVES     VISIBLE TO USER?   COST
─────────────────────────────────────────────────────────────────────
Standard         Implicit (KV cache state) No                 Base
Chain-of-thought In response tokens        Yes                +output tokens
Extended thinking Separate thinking block  Dev only (optional) +thinking tokens
```

In **standard mode**, the model's reasoning is implicit. It's encoded in the weights and the internal KV cache state — the model "reasons," but that reasoning doesn't produce any tokens you can observe. You see the output directly. Fast, cheap, opaque.

In **chain-of-thought mode** (which you elicit via prompt: "think step by step," "work through this"), the reasoning becomes explicit tokens in the response itself. You see it because it's literally part of what Claude outputs. The intermediate tokens constrain subsequent ones — the mechanism that makes CoT more accurate on complex tasks.

In **extended thinking mode**, the reasoning is *also* explicit token-by-token — but it's separated into its own `thinking` content block in the API response, not mixed into the response text. The end-user sees only the final answer. You, as the developer, can read the full scratchpad if you choose.

---

## The API Mechanics

When you enable extended thinking in the Claude API, you add a `thinking` parameter to your request:

```python
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=16000,
    thinking={
        "type": "enabled",
        "budget_tokens": 10000   # max tokens Claude can spend thinking
    },
    messages=[{"role": "user", "content": "Calculate net margin..."}]
)
```

The response now contains two content blocks:

```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "Let me work through each SKU. SKU-A: base price $42, supplier discount 8%...
                   Wait, there's a stacked discount condition in Q3. Let me check..."
    },
    {
      "type": "text",
      "text": "Net margin impact: -2.3% across the portfolio. SKU-A and SKU-F are the outliers."
    }
  ]
}
```

The `thinking` block is the scratchpad. The `text` block is the response. Only the `text` block gets shown to the end-user in most application implementations.

The `budget_tokens` parameter is important: it's a ceiling, not a target. Claude will stop thinking when it reaches a conclusion, not necessarily when it hits the budget. A low budget (1,000 tokens) means lighter deliberation. A high budget (10,000+ tokens) unlocks deep multi-step reasoning on hard problems.

---

## Why This Works: The Mechanism

The same mechanism that makes chain-of-thought effective applies here: **intermediate tokens constrain subsequent generation**.

When Claude generates a `thinking` block, it's producing a token sequence. Each token it writes narrows the probability distribution for the next one. By the time it reaches a conclusion in the scratchpad and begins generating the `text` response, the thinking tokens are in its context — they've already done the work of narrowing the solution space.

Think of it this way:

```
Standard mode:
  [System prompt] → [User message] → Response
                                     ↑ model must bridge this gap in one shot

Extended thinking:
  [System prompt] → [User message] → [Thinking scratchpad] → Response
                                      ↑ gap is bridged here    ↑ well-grounded
```

The scratchpad doesn't just "help" — it *is* the reasoning. The final response is almost a summary of conclusions the model has already reached in the thinking block.

---

## When Extended Thinking Earns Its Cost

Extended thinking has a real cost: thinking tokens are billed at the same rate as output tokens, and a 10,000-token scratchpad on a complex task is meaningful. You don't enable it everywhere. The question is: when is the investment worth it?

**High-value use cases:**

- **Multi-variable calculations**: Margin analysis across 200 SKUs with nested discount rules, currency conversion, and seasonal adjustments. Standard mode drifts on the edge cases. Extended thinking catches them.

- **Long-horizon planning**: "Draft a 6-month supplier diversification plan for Earnventory given these constraints." The model needs to hold many constraints simultaneously and reason across them. The scratchpad is where that happens coherently.

- **Ambiguous decision trees**: "This supplier's contract has three clauses that interact. Given our Q4 volume commitment, what's the net obligation?" Legal/contractual reasoning where the model needs to trace each path explicitly.

- **Debugging complex logic**: Sending in a piece of application code with a subtle bug. Extended thinking lets the model trace execution paths before concluding where the error lives.

- **Tasks where you need an audit trail**: Even if the end-user doesn't see the thinking block, you can log it for debugging or compliance purposes. The thinking block tells you *why* the model gave the answer it did.

**Cases where extended thinking is overkill:**

- Factual lookups ("What's the capital of Germany?")
- Single-step extractions ("Pull the invoice number from this email")
- Creative tasks where divergent exploration is the goal
- High-throughput pipelines where latency matters more than accuracy
- Anything with a time-sensitive user-facing response requirement

---

## The Budget Tokens Trade-off in Practice

```
BUDGET       TYPICAL USE CASE                  LATENCY IMPACT
─────────────────────────────────────────────────────────────
1,000        Simple verification, light review  ~1s extra
5,000        Multi-step calculation, reasoning  ~3–5s extra
10,000       Complex planning, code debugging   ~8–12s extra
16,000+      Research synthesis, deep analysis  15s+ extra
```

These are illustrative ranges. Actual latency depends on model tier, infrastructure, and how quickly Claude reaches a conclusion within the budget.

One subtlety: **you should not confuse budget with quality**. A higher budget doesn't guarantee better reasoning — it gives Claude *room* to reason more deeply if the problem requires it. If a task only needs 800 thinking tokens to solve, Claude stops there. The budget is a ceiling, not a floor.

For Earnventory applications: set the budget based on task complexity, not habit. Supplier email triage → 1,000 tokens max. Quarterly margin analysis with edge cases → 5,000–8,000 tokens. Full procurement strategy synthesis → 10,000+.

---

## How Extended Thinking Relates to ReAct

These are complementary, not competing patterns.

ReAct is about the **loop structure**: Reason → Act → Observe → Reason. It governs how an agent sequences reasoning and tool calls over multiple turns.

Extended thinking is about the **reasoning depth within a single turn**: before Claude produces any visible output, it has the ability to deliberate at length in a private scratchpad.

In a production agent, you can use both:

```
[Turn 1]
  Extended thinking: "I need to check three email threads and cross-reference the
                      latest pricing sheet before I can answer this."
  Act: search_email(query="Mensah Trading invoice")
  Observe: [two results]

[Turn 2]
  Extended thinking: "The invoice dates are inconsistent. The July one references a
                      contract amendment I haven't seen. I should flag this."
  Act: get_email(id="july-invoice")
  Observe: [full email]

[Turn 3]
  Extended thinking: "OK — there was a rate change in June. The July invoice is
                      actually correct. The discrepancy is in our local records."
  Final response: "Your records show $2,400 but the invoice is correct at $2,650
                   due to the June rate update. Recommend updating Earnventory."
```

Each turn has its own thinking block. The ReAct loop governs the outer cycle. Extended thinking deepens each reasoning step within the cycle.

---

## What You Can't Do With the Thinking Block

A few important constraints:

**You can't inject into it.** The thinking block is generated by the model, not by you. You can set the budget, but you can't prepopulate it or steer it mid-generation. What you write in the `user` message and `system` prompt influences the thinking indirectly — the model reasons from those inputs — but you don't write thinking content yourself.

**You can't partially hide it.** The API either returns the full thinking block or you strip it before showing the user. There's no selective exposure.

**It doesn't persist between API calls.** Like all context, the thinking block is part of the current turn's response. If you're running a multi-turn conversation, you can include previous thinking blocks in subsequent `assistant` turns — this helps the model build on prior reasoning — but you have to do that explicitly.

---

## An Earnventory Decision

Imagine you're building an Earnventory agent to assist with supplier contract reviews. Two design options:

**Option A (Standard mode):** Send the contract text + question → get answer directly. Fast. Works for simple questions. Might miss nested clause interactions.

**Option B (Extended thinking, 8,000 token budget):** Same setup, but Claude deliberates privately before answering. Surfaces the clause interactions. Produces a traceable rationale you can log. Slower by ~8 seconds. More expensive per call.

The right choice depends on stakes. For quick "is this standard boilerplate?" queries: Option A. For "do we have exposure on the force majeure clause given our Q4 volume commitment?": Option B, every time.

The latency cost is also worth auditing against what it's replacing. If a contract review question would otherwise require 20 minutes of someone's time to check manually, an 8-second API call with extended thinking is not a bottleneck — it's a 99% speedup.

---

## Summary

| What | Why it matters |
|------|----------------|
| Extended thinking = private scratchpad | Separates reasoning from response; dev-visible, user-hidden |
| `thinking` content block in API | Explicit token-by-token deliberation with configurable budget |
| Intermediate tokens constrain final output | Same mechanism as CoT — just separated architecturally |
| Budget is a ceiling, not a target | Claude stops when it has an answer, not when it hits the budget |
| Best for high-stakes, multi-variable, auditable tasks | Cost/latency justified by accuracy lift on complex problems |
| Composable with ReAct | Extended thinking per turn + ReAct outer loop = full-depth agent |

---

## Free Resources

- **Anthropic's Extended Thinking Guide**: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking — the official documentation with API examples and best-practice guidance on budget sizing.

- **"The 'think' tool: Enabling Claude to stop and think" (Anthropic Engineering Blog)**: https://www.anthropic.com/engineering/claude-think-tool — covers how explicit reasoning tools work at the architectural level and when they help vs. hurt.

---

*Next up — Day 56: When agents plan ahead, and when they shouldn't. The difference between upfront hierarchical task decomposition and reactive step-by-step replanning — and the failure modes of each.*
