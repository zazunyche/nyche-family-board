# AI Agents Day 16: Chain of Thought — Making the Model Show Its Work
**Why Intermediate Tokens Are Load-Bearing, Not Commentary**

*Module 1.4, Day 16 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | July 2, 2026*

---

## The Short Version

Chain-of-thought (CoT) prompting forces a language model to generate explicit reasoning steps before producing a final answer. This isn't a UX trick — it works because the intermediate tokens become part of what the model conditions on when generating subsequent tokens. The reasoning is structurally load-bearing: each step constrains the next. For any task requiring more than a single logical operation, CoT measurably improves accuracy. Understanding why — not just that it works — changes how you prompt agents and design Earnventory features.

---

## The Core Mechanism

To understand why CoT works, you need to remember one thing from Mini-Module 1.2: the model is always doing one thing — predicting the most probable next token given everything that came before it.

Let's trace what "everything that came before" looks like in two cases:

```
WITHOUT CHAIN-OF-THOUGHT
═══════════════════════════════════════════════════════════════════
PROMPT: "SKU A has a base cost of $42. The new tariff is 17%.
         What is the landed cost?"

MODEL INPUT AT ANSWER TIME:
  [system prompt] + [the question above]

MODEL PREDICTS: "$49.14"  (or maybe "$50.54" — no trail)

ERROR RISK: High for multi-step arithmetic.
The model jumped from question to answer.
If the implicit calculation went wrong, there's no trail.
═══════════════════════════════════════════════════════════════════

WITH CHAIN-OF-THOUGHT
═══════════════════════════════════════════════════════════════════
PROMPT: "SKU A has a base cost of $42. The new tariff is 17%.
         What is the landed cost? Think step by step."

MODEL GENERATES (before answering):
  "The tariff rate is 17%, or 0.17 as a decimal.
   Tariff amount = $42 × 0.17 = $7.14.
   Landed cost = $42 + $7.14 = $49.14."

MODEL INPUT AT ANSWER TIME:
  [system prompt] + [question] + [three steps above]

MODEL PREDICTS: "$49.14"

ERROR RISK: Lower. Each step is conditioned on the previous.
Errors in step 2 are visible and constrain step 3.
═══════════════════════════════════════════════════════════════════
```

The critical observation: the model isn't "thinking" and then reporting. It's generating reasoning tokens that become part of its own input. Step 3 isn't derived from step 2 in some internal computation — step 3 is a next-token prediction that is conditioned on the text of step 2 being present in the context window. The reasoning is structural, not cognitive.

This means three things:

**1. Errors in intermediate steps propagate deterministically.** If step 2 says "$42 × 0.17 = $8.14" (wrong), step 3 will likely say "$42 + $8.14 = $50.14" — a wrong answer that's internally consistent with the error. The chain constrains everything downstream.

**2. CoT makes implicit errors visible.** A model answering directly can hallucinate a plausible-looking number with no audit trail. A model showing work can be wrong in a way you can catch at a specific step. The error surface shifts from "invisible" to "locatable."

**3. Explicit steps can surface hidden assumptions.** If a model's reasoning reveals an assumption you didn't intend — "I'll treat this as a US domestic shipment" — you can catch it before the final answer. Without CoT, that assumption is silently baked in.

---

## How to Elicit Chain-of-Thought

There are three main approaches, roughly in order of control:

**1. Zero-shot CoT — instruction only**

Add an explicit reasoning instruction to an otherwise normal prompt. The most studied phrase is "Let's think step by step." It works across a wide range of tasks with no examples required.

More specific variants work better for structured domains:

- "Before answering, reason through the calculation explicitly."
- "Think through each factor. Then give your final answer on a new line."
- "Walk me through your reasoning before stating the result."

For Earnventory: "Walk through each input before calculating the margin impact."

**2. Few-shot CoT — reasoning shown in examples**

Provide one or two examples in the prompt that demonstrate the reasoning format, not just the correct answer:

```
Example:
Q: SKU B has a base cost of $30, a 12% tariff. What is the landed cost?
A: Tariff rate is 12%, or 0.12. Tariff amount = $30 × 0.12 = $3.60.
   Landed cost = $30 + $3.60 = $33.60.

Your turn:
Q: SKU C has a base cost of $85, a 9% tariff. What is the landed cost?
A:
```

The model learns the *structure* of reasoning from the example and applies it to the new problem. This is more reliable than zero-shot CoT for tasks with a specific format, because the example pins the format more concretely than an instruction alone.

**3. XML-structured reasoning — for agent contexts**

In production agent systems, you often want to separate the model's reasoning from its user-facing output. XML tags do this cleanly:

```
Prompt suffix: "Before answering, put your reasoning in <thinking> tags.
                Put your final answer in <answer> tags."

Model output:
<thinking>
Base cost is $42. Tariff is 17%. 17% of 42 = 0.17 × 42 = 7.14.
Landed cost = 42 + 7.14 = 49.14.
</thinking>
<answer>$49.14</answer>
```

This gives you the full reasoning trace for logging and debugging without surfacing it to the end user. In the Claude system, this is exactly how extended thinking mode works architecturally — the reasoning lives in a dedicated block rather than polluting the final response. Day 18 covers this in detail.

---

## When to Suppress CoT

CoT isn't universally better. There are cases where you want to turn it off or not elicit it:

```
USE COT WHEN:                         SUPPRESS WHEN:
─────────────────────────────────────────────────────────────
Multi-step arithmetic                 Single-step lookup
Sequential logical reasoning          Pure retrieval tasks
Comparison across multiple factors    Simple classification
Constraint satisfaction               Latency is the priority
You need an audit trail               High-volume, cost-sensitive
Anything with more than 2 inputs       batches where accuracy
feeding one output                     tradeoff is acceptable
─────────────────────────────────────────────────────────────
```

Reasoning tokens cost money and add latency. For a high-volume Earnventory task that runs thousands of times — generating product descriptions, classifying invoice line items into categories — you probably don't want extended CoT. For a one-time complex margin analysis across 200 SKUs with several adjustments, CoT pays for itself in reduced error and audit clarity.

---

## Error Propagation: A Visual

This diagram shows how errors behave differently with and without CoT:

```
WITHOUT COT — SILENT ERROR
═══════════════════════════════════════════════════════════════════
Question ──→ [implicit reasoning, invisible] ──→ Wrong Answer
                          ↑
               No audit trail. No place to catch the error.
               The answer looks like any other answer.
═══════════════════════════════════════════════════════════════════

WITH COT — ERROR IS LOCATABLE
═══════════════════════════════════════════════════════════════════
Question ──→ Step 1 (OK) ──→ Step 2 (ERROR) ──→ Step 3 (wrong,
                                  ↑               but internally
                           Error visible here.    consistent) ──→ Wrong Answer
                           Catch it at Step 2
                           before it propagates.
═══════════════════════════════════════════════════════════════════

WITH COT — CORRECT
═══════════════════════════════════════════════════════════════════
Question ──→ Step 1 ──→ Step 2 ──→ Step 3 ──→ Correct Answer
                                       ↑
                        Each step constrained by previous.
                        Correct chain makes correct final
                        prediction more likely.
═══════════════════════════════════════════════════════════════════
```

The middle case is key. CoT doesn't eliminate errors. What it does is make the error location visible — which gives you three things: the ability to catch it programmatically, the ability to debug the prompt that caused it, and (in some cases) the opportunity for the model to self-correct in a later step.

---

## The Connection to Extended Thinking Mode

What Claude's extended thinking mode does (covered in Day 18) is the same mechanism as CoT, but more deeply integrated at the architecture level:

- **Standard CoT:** Reasoning appears in the output, visible in the response text
- **Extended thinking:** Reasoning happens in a dedicated `thinking` block with a configurable token budget; the final answer is then generated conditioned on all that reasoning

The underlying principle is identical: more tokens of explicit reasoning before committing to the answer improves accuracy on complex tasks. The differences are budget (extended thinking can reason for much longer), visibility (thinking blocks are typically hidden from end users), and cost (extended thinking charges for thinking tokens at a different rate).

Day 18 will go into the architecture and cost tradeoffs. Today's grounding is: CoT and extended thinking are the same mechanism at different integration depths.

---

## Why This Matters for Agentic Tasks

In an agent context, the same principle applies at the task level. An agent processing a multi-step workflow — "check supplier invoices, identify overdue items, calculate penalty amounts, draft follow-up emails" — benefits from generating an explicit plan before starting execution. That plan becomes part of the context that constrains each subsequent action.

```
AGENT WITHOUT EXPLICIT REASONING
═══════════════════════════════════════════════════════════════════
Task prompt ──→ [Agent acts immediately] ──→ Tool call 1 ──→ Tool call 2 ──→ Output
                                                 ↑
                              No explicit plan. Each action
                              is a pattern-match from the task
                              prompt plus prior tool results.
═══════════════════════════════════════════════════════════════════

AGENT WITH COT AT TASK LEVEL
═══════════════════════════════════════════════════════════════════
Task prompt ──→ [Explicit plan generated] ──→ Step 1: call X ──→ observe ──→
              "I'll first check invoices    Step 2: filter Y ──→ observe ──→
               from the last 30 days,       Step 3: calculate ──→ observe ──→
               then filter overdue,         Step 4: draft email ──→ Output
               then..."
                    ↑
            Plan constrains each subsequent step.
            Deviations from plan are legible.
═══════════════════════════════════════════════════════════════════
```

This is the foundation of the ReAct pattern (Day 17): Reason → Act → Observe → Reason again. CoT is the first R. Without it, the agent is acting from pattern-matching alone. With it, each action is conditioned on explicitly generated reasoning — which makes the sequence of actions more coherent and the error trail visible.

---

## Earnventory Application: Two Concrete Cases

**Case 1: Margin analysis after a tariff and price change.**

A supplier raises their base price 8% and a new 17% tariff applies on top. Calculating net margin impact requires: applying the price increase, applying the tariff, recalculating freight (which may scale with value), comparing to the historical margin for that SKU, checking against the margin floor that triggers a pricing review.

That's five chained operations. Without CoT, errors in any intermediate operation are invisible in the final number. With CoT, each operation is logged — the final margin figure is traceable to the specific calculation that drove it. If it's wrong, you know exactly where.

**Case 2: Reorder quantity decision.**

Factors: current stock level, average daily sales rate, supplier lead time, safety stock formula (usually: safety_stock = Z × σ × √lead_time), budget ceiling for the period, minimum order quantity from the supplier.

The model needs to reason through each constraint before landing on a number. Without CoT, the quantity can be wrong in a way that's hard to trace — was it the lead time that was off? The safety stock formula? With CoT, the reasoning shows which constraint was binding and what drove the final quantity.

**Default rule:** Any Earnventory agent task involving more than two data inputs feeding one decision should elicit CoT. The token overhead is small — typically 50–200 additional tokens for a simple multi-step problem. The improvement in accuracy and debuggability is not small.

---

## What's Next

Tomorrow: **ReAct — the loop that makes agents smart.** We'll trace the full Reason → Act → Observe → Reason cycle through a concrete Zazu task: "find all unread emails from suppliers from the last 7 days and summarize them." CoT is the R in ReAct. Tomorrow you'll see the complete pattern and understand why it's the standard architecture for task-executing agents.

The **Mini-Module 1.3 quiz** will arrive separately — five questions covering context windows, the four memory types, RAG, context engineering, and Zazu's memory architecture. Reply with whatever level of detail feels right; it's calibration, not grading.

---

## Free Resources

1. **Anthropic's Chain-of-Thought Prompting Guide**
   Anthropic's official documentation on how to elicit chain-of-thought reasoning from Claude — zero-shot vs. few-shot approaches, when to use it, and how it interacts with structured outputs. Directly applicable to Earnventory agent prompts.
   https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought

2. **"Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" (Wei et al., 2022 — Google Brain)**
   The paper that established CoT as a named technique rather than folk wisdom. Shows across eight reasoning benchmarks that CoT prompting substantially improves performance, and that the improvement scales with model size. The abstract and Section 3 are enough for the core insight. Free on arXiv.
   https://arxiv.org/abs/2201.11903

---

## One Sentence to Carry Forward

Chain-of-thought works because intermediate reasoning tokens are structurally load-bearing — each step becomes part of what the model conditions on when generating the next step, so explicit reasoning reduces error accumulation the same way showing your work on a math test keeps each written step honest about what came before it.

---

*Day 16 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.4: Reasoning and Planning — Day 1 of 4*
