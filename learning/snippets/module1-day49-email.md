# AI Agents Day 49: Continuous Evals and Behavioral Drift

Mini-Module 2.4: Agent Systems in Production | Day 49 of 50

---

## What You'll Understand After This

After today, you can:
- Define behavioral drift and name its three root causes
- Design a continuous eval pipeline for an agent feature
- Distinguish point-in-time evals from continuous evals and know when each is sufficient
- Identify the metrics that surface drift before it reaches production severity
- Apply the golden dataset pattern to an Earnventory invoice-summarization agent

---

## The Setup

Yesterday: the reversibility principle and minimal footprint — how to design so that errors are bounded and recoverable.

Today: how to detect that your agent is getting worse before your users tell you.

This is the gap that kills production agents in practice. You build the agent. You write evals. You pass them. You ship. Three months later, something changed — you're not sure what — and accuracy is down. A supplier got the wrong order. A summary was confidently wrong. An alert that should have fired didn't.

You find out from the symptom, not from a dashboard.

Continuous evals are how you close that gap.

---

## Part 1: What Is Behavioral Drift?

**Behavioral drift** is the phenomenon where an agent that was performing correctly at launch gradually — or suddenly — performs worse over time, without any intentional change to the agent's code.

Three root causes:

### 1. Model Updates

Anthropic ships model updates on a rolling basis. These updates improve the model across most dimensions, but they can change behavior in ways that are subtle and specific to your use case. A model that was slightly liberal in flagging invoices as "duplicate" may become slightly conservative after an update. A model that formatted summaries as bullet lists may switch to prose.

These are not bugs. They are the model improving at the general task. But if your agent was calibrated to the old behavior, and your downstream code expected bullet-list output, the update breaks you.

The update is invisible unless you're measuring.

### 2. Data Distribution Shift

Your agent was built and calibrated on the data you had in January. By August:
- New suppliers have joined Earnventory with different invoice formats
- Your SKU catalog has changed — new items, retired items, renamed categories
- Exchange rates and product classifications have shifted
- Customers are asking new types of questions the training distribution didn't cover

The model hasn't changed. Your eval golden dataset still passes. But the real inputs your agent receives no longer match the distribution it was calibrated on. Accuracy drops on the new cases while staying fine on the old ones.

This is the subtlest form of drift, because nothing you control changed. The world changed.

### 3. Prompt Drift

System prompts and tool descriptions get touched over time. A developer fixes a typo and introduces a subtle ambiguity. A new tool is added and changes the model's behavior on existing tool selections. Someone copies the system prompt from staging to production without noticing they pasted the outdated version.

```
PROMPT DRIFT ANATOMY

Original (v1, January):
  "Summarize the invoice. Include: supplier name, total, line items.
   Format as structured JSON."

After edits (v7, August):
  "Summarize the invoice. Include: supplier name, total, line items.
   Format as structured JSON. Note any discrepancies."

The added "note any discrepancies" instruction changes model behavior
on ALL invoices, not just discrepant ones. The model now produces
longer output with qualification language. Edge cases that passed v1
evals may now fail downstream parsing silently.
```

Prompt drift is the most preventable form of drift, and the most commonly missed because it happens in small increments that each seem harmless.

---

## Part 2: The Continuous Eval Architecture

### Point-in-Time vs. Continuous

A point-in-time eval (your pre-launch gate) answers: "Is the agent good enough to ship?" A continuous eval answers: "Is the agent still as good as it was last week?"

The structure is identical. What changes is cadence and what you're comparing against.

```
CONTINUOUS EVAL PIPELINE

1. GOLDEN DATASET
   ┌─────────────────────────────────────────────┐
   │  N representative inputs + expected outputs  │
   │  Covers: common cases, edge cases, known     │
   │  failure modes, high-value paths             │
   └─────────────────────────────────────────────┘
             │
             ▼
2. SCHEDULED RUNNER
   ┌─────────────────────────────────────────────┐
   │  Run golden dataset against current agent    │
   │  Frequency: weekly / on model version change │
   │  Also: sample N% of real production traffic  │
   │  and score those too                         │
   └─────────────────────────────────────────────┘
             │
             ▼
3. SCORER
   ┌─────────────────────────────────────────────┐
   │  Score each output against expected:         │
   │    - Deterministic: exact match, regex       │
   │    - LLM-as-judge: structured rubric         │
   │    - Human review: for high-stakes samples   │
   └─────────────────────────────────────────────┘
             │
             ▼
4. METRICS + BASELINE
   ┌─────────────────────────────────────────────┐
   │  Store: run_id, timestamp, model_version,    │
   │         score, delta_vs_baseline             │
   │  Compare: this week vs. last week's baseline │
   └─────────────────────────────────────────────┘
             │
             ▼
5. ALERTING
   ┌─────────────────────────────────────────────┐
   │  score < threshold → alert                   │
   │  delta > X% → alert                         │
   │  new failure mode detected → alert           │
   └─────────────────────────────────────────────┘
```

The critical step is Step 4: **storing scores with timestamps and model version numbers**. Without that, you can detect that accuracy is 81% today, but you can't tell whether it was always 81% or dropped from 94% last week. The baseline is what makes the measurement actionable.

---

### Building the Golden Dataset

The golden dataset is your ground truth. Building it well is the most important investment in your eval infrastructure.

**What to include:**
- Common-case inputs (the 80% of real traffic that represents normal operation)
- Known edge cases (inputs that caused problems in prior debugging)
- High-value inputs (large POs, supplier contacts with escalation history)
- Adversarial inputs (cases designed to trigger hallucination or wrong tool selection)
- Distribution-spanning inputs (inputs from each major supplier format, not just the most common)

**How many?** Start with 20-50 cases. That's enough to detect a 10-percentage-point accuracy regression with reasonable statistical confidence. As your agent matures and you understand its failure mode taxonomy, expand to 100-200.

**Expected outputs:** For structured tasks (JSON extraction, line-item counting), the expected output is deterministic — you can diff exactly. For summarization or classification, define a rubric and score with an LLM-as-judge. The judge prompt matters enormously:

```
WEAK JUDGE PROMPT:
  "Is this invoice summary correct? Yes or no."

STRONG JUDGE PROMPT:
  "The following is a summary of invoice INV-2847.
   Answer YES or NO for each criterion:
   1. Does it include the correct total [$4,230.00]?
   2. Does it list all 3 line items by name?
   3. Does it flag the missing PO reference number?
   Output: {"total": YES/NO, "line_items": YES/NO, "po_flag": YES/NO}"
```

The strong prompt gives you a score per criterion, not a vague binary. You can track which criterion degrades first — which tells you whether it's a format problem, a factual accuracy problem, or a flagging problem. Different causes require different fixes.

---

## Part 3: Sampling Production Traffic

The golden dataset covers cases you anticipated. Production traffic covers cases you didn't.

The mature continuous eval pattern is to sample real production invocations:
1. Log a random N% of real agent inputs and outputs (with appropriate privacy controls — redact PII before it hits your eval store)
2. Route a subset to your scorer on a weekly schedule
3. Human-review a random sample of 10-20 cases per run to validate the scorer's accuracy

This gives you a signal that's impossible to fake with a curated dataset: how the agent is performing on real data. Distribution shift shows up here before it shows up in golden dataset metrics — because your golden dataset doesn't have the new supplier formats that started appearing last month, but production traffic does.

The combination of both methods gives you complementary coverage:
- Golden dataset → catches regressions on known cases
- Production sampling → catches emerging failures on unknown cases

---

## Part 4: What to Measure

Beyond pass/fail rates, continuous evals should track a set of derived metrics that catch specific failure modes:

| Metric | What It Catches |
|--------|-----------------|
| **Accuracy by category** | Drift that affects some input types but not others (e.g., new supplier format) |
| **Tool call frequency** | Unexpected shifts in which tools the model selects — may indicate prompt change effect |
| **Output format compliance** | JSON schema violations, missing required fields, unexpected keys |
| **Latency per invocation** | Model updates can shift generation speed; sustained latency increase may signal context bloat |
| **Token count drift** | If outputs get longer or shorter, the model changed how it generates — downstream parsing may break |
| **Refusal rate** | If the agent starts refusing previously-valid inputs, a policy or system prompt change is likely |

**Token count drift** is an underrated signal. If your invoice summaries suddenly average 400 tokens instead of 200, something changed in how the model generates them. That's not necessarily wrong — but it's different, and different means your downstream display code and context budget assumptions may be violated in ways that don't surface as obvious errors.

---

## Part 5: Earnventory Application

For your invoice-summarization agent, a practical continuous eval setup looks like this:

**Golden dataset (50 invoices):**
- Standard formats from your 5 largest suppliers (10 invoices each)
- Edge cases: missing PO number, multi-currency totals, partial shipments, duplicate line items
- Historically problematic: 10 invoices the agent got wrong in its first two months of operation

**Scorer:**
- Deterministic check: total amount matches ground truth, line-item count correct
- LLM-as-judge: completeness and accuracy rubric with per-criterion scoring

**Schedule:** Weekly run on Monday morning. Alert if accuracy drops below 85% or delta vs. previous run exceeds 8%.

**Model version tracking:** Every invocation in your log records which model version handled it. When you see a score change, the first question is always: did the model version change between runs?

```
EARNVENTORY CONTINUOUS EVAL — SAMPLE DASHBOARD

Week     Score   Model Ver    Delta   Status
────────────────────────────────────────────────────
Wk 01    94%     sonnet-4.6   —       Baseline
Wk 02    93%     sonnet-4.6   -1%     OK
Wk 03    91%     sonnet-4.6   -2%     Monitor
Wk 04    81%     sonnet-4.7   -10%    ALERT
         │
         └── Investigate: model version changed between Wk 03 and Wk 04
             Hypothesis: new model generates JSON differently on edge cases
             Action: audit failing cases, update system prompt if needed,
                     re-run golden dataset with adjusted scorer
```

Week 4 is where you catch the problem — during your Monday morning review, not in a Friday support escalation from a supplier whose order was wrong. The cost of investigation is an hour. The cost of missing it compounds with each passing week.

---

## Behavioral Drift Is Inevitable — Detect It Early

The takeaway isn't "run evals to prevent drift." You can't prevent drift. Models update. Data changes. Prompts evolve. The system you shipped in January is not the system running in August, even if you haven't touched the code.

The takeaway is: **make drift visible before it becomes a production incident.** Continuous evals don't fix drift — they tell you when it's happening, fast enough to investigate and correct before it compounds.

Combined with the observability infrastructure from Day 47 (trajectory logging, invocation traces), continuous evals complete your production monitoring picture:
- **Logging** tells you what happened in a specific run
- **Evals** tell you whether the agent is getting better or worse across runs over time

One gives you forensics. The other gives you surveillance. You need both.

This is what it means to run an agent system in production: not just building it correctly, but continuously verifying that it remains correct as the world around it changes. The verification is never finished. It runs on a schedule, like everything else in a well-engineered system.

---

## Free Resources

- **"Building an evaluation framework for AI models" (Scale AI):** https://scale.com/blog/evaluating-ai-models — practical walkthrough of golden datasets, LLM-as-judge scoring, and regression detection; the examples map directly to production agent evaluation
- **"Evals are all you need" (Hamel Husain):** https://hamel.dev/blog/posts/evals/ — opinionated and practitioner-focused; the section on sampling production traffic vs. golden datasets is directly applicable to the continuous eval design pattern covered today

---

Tomorrow (Day 50 — the finale): we step back and audit Zazu's full architecture against everything in Module 2. What reliability guarantees does it actually have? Where are its real failure modes? And what would you design differently if you were building it for Earnventory from scratch?
