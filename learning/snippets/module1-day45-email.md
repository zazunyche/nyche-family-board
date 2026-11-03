# AI Agents Day 45: What Is an Eval, and Why You Need One Before Launch

Mini-Module 2.4: Agent Systems in Production | Day 45 of 50

---

## What You'll Understand After This

After today, you can:
- Define an LLM eval and explain how it differs from a traditional software test
- Identify the three characteristics that separate a useful eval from a useless one
- Name and distinguish the three major eval types: deterministic, LLM-as-judge, and human
- Design a minimal eval for an Earnventory agent feature
- Explain why evals are not optional for any agent system that handles real decisions

---

## The Core Problem: Agents Don't Throw Exceptions

When you write a function in Python, you can test it exactly:

```python
assert calculate_margin(cost=10, price=15) == 0.333
```

Pass or fail. Deterministic. The function either returns the right answer or it doesn't.

An agent doesn't work like that. Ask it to "summarize this supplier invoice" and you get a paragraph — and that paragraph might be excellent, acceptable, or subtly wrong in ways that produce no error at all. The agent doesn't throw an exception when it hallucinates a line item. It generates confident, fluent text that includes something that wasn't in the source document, and your application has no idea.

This is the core testing problem for AI systems: **there's no obvious assertion to write.** And yet you still need to know whether the system is behaving correctly — before you launch, and after every change.

That's what an **eval** is for.

---

## What Is an Eval?

An **eval** (evaluation) is a structured, repeatable test suite that measures the quality of an AI system's outputs against defined criteria.

The term comes from ML research, but in production it has a very practical meaning: it's the mechanism that answers the question *"Is this agent behaving correctly across the range of inputs it will encounter in the real world?"*

The key word is *repeatable*. A one-time manual check isn't an eval. Running the agent on three test cases before the first launch isn't an eval. An eval is something you run systematically, before every consequential change, and compare against a known-good baseline.

---

## Three Characteristics of a Useful Eval

Not all "tests" are equally useful. Here's what separates an eval that protects you from one that just gives you false confidence:

### 1. Representative Inputs

Your eval must cover the actual distribution of inputs your agent will encounter — including edge cases.

If you only test your Earnventory invoice summarizer on clean, well-formatted PDFs, and 20% of real supplier invoices arrive as scanned images with handwritten corrections, your eval will show 99% accuracy in testing and 70% accuracy in production. That's not a model failure — it's a test design failure.

Representative inputs require:
- **Real examples from your actual data**, not hand-crafted "ideal" cases
- **Edge cases you've already seen fail** (or that you can anticipate)
- **Adversarial cases** designed to probe known weaknesses
- **Enough volume** to detect meaningful regressions statistically

For an Earnventory feature, 30–100 test cases is usually enough to get meaningful signal at the feature level. For a workflow that touches financial data or supplier relationships, you want more — and you want the cases to actually be hard.

### 2. Clear Scoring Criteria

Every eval case needs a defined answer to the question: *what counts as correct here?*

This sounds obvious, but it's consistently the hardest part. For deterministic outputs (did the agent call the right tool? did it return the right SKU?), it's easy. For qualitative outputs (is this summary accurate? is this email professional enough to send?), you need explicit rubrics — otherwise different evaluators reach different verdicts, and your "test results" are noise.

A weak scoring criterion: "Is the summary good?"

A strong scoring criterion: "Does the summary include (a) the supplier name exactly as written in the invoice, (b) the correct invoice total in USD, (c) the due date, and (d) no figures or claims not present in the source document?"

Good criteria are:
- **Specific** — two independent scorers should reach the same conclusion
- **Binary or ordinal** — pass/fail, or a 1–5 scale with defined anchors for each level
- **Exhaustive** — covering the dimensions that actually matter, including the ones that are hard to measure

### 3. Regression Detection

This is the most important characteristic — and the most frequently skipped.

An eval isn't just for the pre-launch check. Its value multiplies as you run it repeatedly over time. Every model version upgrade, every prompt edit, every tool modification: run the eval. Compare against the last known-good baseline. If accuracy drops by more than your threshold (say, 3 percentage points), investigate before deploying.

```
Before change: 96% deterministic pass rate, LLM-judge mean score 4.3
After prompt edit: 88% deterministic pass rate, LLM-judge mean score 4.1
→ Hold deployment. Something regressed. Find it.
```

Without this, you're flying blind. You upgrade Claude Sonnet to a new version, your agent's behavior subtly changes on edge cases, and you find out three weeks later when a supplier flags a bad purchase order. With a regression-detecting eval, you catch it in 10 minutes.

---

## The Three Types of Evals

Not all agent outputs can be evaluated the same way. There are three distinct approaches, each suited to different kinds of outputs:

### Type 1: Deterministic Evals

**What they are:** Rule-based assertions with definitive right/wrong answers.

**Use when:** The output has a ground truth that can be checked programmatically.

**Examples:**
- Did the agent extract the correct invoice total? (compare to ground truth)
- Did the agent call `send_email` when it should have? (check tool call log)
- Did the response arrive within your latency budget? (timing check)
- Does the output JSON validate against the expected schema?

**Pros:** Fast, cheap, objective, fully automatable.
**Cons:** Only works for the fraction of outputs that are truly deterministic.

```
Test:     "Parse this invoice and return structured data."
Input:    invoice_sample_042.pdf
Expected: {"supplier": "Riverside Wholesale", "total_usd": 4820.00, "due_date": "2026-08-15"}
Actual:   {"supplier": "Riverside Wholesale", "total_usd": 4820.00, "due_date": "2026-08-15"}
Result:   PASS
```

### Type 2: LLM-as-Judge Evals

**What they are:** A second LLM evaluates the quality of the first LLM's output against a rubric.

**Use when:** The output is qualitative — a summary, a drafted email, a recommendation — and there's no single correct answer.

**How it works:**
1. Your agent produces output (e.g., an invoice summary)
2. You send the output, the source document, and your rubric to an evaluator LLM (typically a stronger model, like Opus)
3. The evaluator scores the output on your criteria
4. You aggregate scores across your full eval set

**Example rubric for an Earnventory invoice summary:**

```
You are evaluating an AI-generated invoice summary.
Score it on three dimensions, 1 to 5 each:

- Accuracy (1–5): Does it contain only information from the source invoice?
  1 = contains hallucinated facts; 5 = perfectly faithful to source
- Completeness (1–5): Does it include all material line items, totals, and dates?
  1 = missing critical fields; 5 = all essential information present
- Clarity (1–5): Is it clear and professional, appropriate to share with a supplier?
  1 = confusing or unprofessional; 5 = clear, concise, ready to use

Source invoice: [invoice text]
Agent summary: [agent output]

Respond in JSON only:
{"accuracy": N, "completeness": N, "clarity": N, "notes": "..."}
```

**Pros:** Scales to qualitative outputs without human review on every case.
**Cons:** Introduces a second model's biases; costs tokens; requires careful rubric design. The evaluator LLM can also be wrong — it's a noisy signal, not a ground truth.

**Practical rule:** LLM-as-judge is useful for screening at scale. Validate it periodically by having a human review a sample of the evaluator's verdicts — especially on edge cases where it's most likely to be miscalibrated.

### Type 3: Human Evals

**What they are:** A person reviews agent outputs and rates them against criteria.

**Use when:** Stakes are high, output is nuanced, or you're calibrating your LLM-as-judge.

**Where human evals are essential:**
- Building the initial eval dataset (humans define what "good" looks like for your specific use case)
- Validating that your LLM-as-judge is scoring correctly
- Reviewing flagged edge cases before deployment
- Pre-launch sign-off on workflows that touch financial or supplier data

**Pros:** Most accurate; catches subtle problems automated evals miss.
**Cons:** Slow, expensive, doesn't scale past a few hundred cases.

**Practical rule for Earnventory:** Build your ground-truth dataset with human labels. Use deterministic checks where possible. Use LLM-as-judge for qualitative dimensions at scale. Use human spot-checks to verify the judge isn't drifting from your actual standards.

---

## ASCII: The Eval Architecture

```
  ┌────────────────────────────────────────┐
  │           EVAL SUITE                   │
  │   50 inputs + ground-truth labels      │
  └───────────────────┬────────────────────┘
                      │
                      ▼
  ┌────────────────────────────────────────┐
  │       Run Agent on Each Input          │
  └──────┬───────────────┬────────────────-┘
         │               │
         ▼               ▼
  ┌─────────────┐  ┌─────────────────┐
  │Deterministic│  │  LLM-as-Judge   │
  │  Checks     │  │  Scoring        │
  └──────┬──────┘  └────────┬────────┘
         │                  │
         └────────┬─────────┘
                  │
                  ▼
  ┌────────────────────────────────────────┐
  │    Aggregate Scores vs. Baseline       │
  └──────────────┬─────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
  ┌──────────┐      ┌──────────────┐
  │  PASS    │      │  REGRESSION  │
  │  Deploy  │      │  Investigate │
  └──────────┘      └──────────────┘
```

---

## A Concrete Eval for an Earnventory Feature

Say you're building an agent that reads supplier invoices and outputs structured summaries. Here's what a minimal eval looks like:

**Eval corpus:** 50 real supplier invoices, already reviewed manually (ground truth established)

| Cases | What's Tested | Eval Type | Scoring |
|-------|--------------|-----------|---------|
| 1–50 | Correct supplier name extracted | Deterministic | Pass/fail |
| 1–50 | Correct total extracted (±$0.01) | Deterministic | Pass/fail |
| 1–50 | Correct due date extracted | Deterministic | Pass/fail |
| 1–50 | No hallucinated figures or facts | LLM-as-judge | 1–5 accuracy |
| 1–50 | Summary readable, professional | LLM-as-judge | 1–5 clarity |
| 5 edge cases | Handwritten/damaged invoice | Human | Pass/fail + notes |

**Launch threshold:** ≥95% pass on all deterministic checks; mean LLM-judge score ≥4.0; no catastrophic failures on edge cases.

**Regression threshold:** A drop of more than 3 percentage points on deterministic checks, or more than 0.3 points on mean LLM-judge scores, triggers a deployment hold.

---

## Why Evals Are Non-Negotiable

You might think: "I'll test it manually a few times before I launch, then watch it in production." Here's why that's not sufficient:

**Model updates happen without warning.** Anthropic ships new model versions regularly. Without an eval, you have no way to know whether the new version changes your agent's behavior on edge cases. You find out from a supplier, not from your monitoring.

**Prompt changes have non-obvious effects.** Changing one sentence in a system prompt can fix one behavior and silently break three others. Evals catch this before it ships.

**Edge cases are where production fails.** The cases you didn't think to test manually are exactly the ones that will fail in production — on the supplier you most need to impress, during the quarter-close you can't afford to get wrong.

**The compounding math you already know.** Yesterday you learned that 85% per-step reliability across 10 steps gives 20% end-to-end success. Every percentage point you improve per-step reliability has a multiplied effect end-to-end. Evals tell you your actual per-step reliability — without them, you're making architectural decisions based on guesses.

**The pre-flight analogy holds directly:** A commercial pilot doesn't skip the checklist because yesterday's flight went fine. The checklist exists because most flights are fine — and the ones that aren't can be catastrophic. Your Earnventory agent isn't flying planes, but a wrong purchase order sent to a supplier can damage a real business relationship and create real financial exposure. The checklist is worth the engineering time.

---

## What to Do First

If you have an agent feature in production right now with no eval:

1. **Define three deterministic checks** for the most critical outputs — the things that absolutely must be correct. Write them down explicitly.

2. **Pull 20 real cases** from production logs (or generate them). Label the correct outputs manually. That's your ground truth.

3. **Run the agent** on those 20 cases. Score each one against your three checks.

4. **Record the baseline.** This is your "known good" state. Every future change gets compared to this.

That's a minimal eval. It's not comprehensive, but it's infinitely better than nothing — and it gives you a foundation to build on.

---

## Tomorrow: The Seven Failure Modes That Kill Agent Projects

Day 46 maps the taxonomy of ways agent systems fail in production: prompt injection, context overflow, tool execution errors, hallucination chains, goal drift, over-trust in subagents, and scope creep. Knowing these patterns in advance means you can design against them, not discover them the hard way.

---

*Resources:*
- "Evaluating AI Agents in 2025: A Practical Guide" — https://www.turingcollege.com/blog/evaluating-ai-agents-practical-guide
- "AI Agent Failure Modes: What Goes Wrong in Production" — https://www.trantorinc.com/blog/ai-agent-failure-modes-what-goes-wrong-design-resilience

---

*AI Agents curriculum designed by Abeiku for the Nyche family learning system · Day 45 of 50 · Mini-Module 2.4: Agent Systems in Production*
