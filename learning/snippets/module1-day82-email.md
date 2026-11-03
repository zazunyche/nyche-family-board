# AI Agents Day 82: Retry Budgets — When to Try Again, When to Escalate, and How to Keep Context From Bloating

**Mini-Module 1.3 — Context, Memory, and State | Day 82 of the extended series**

---

## What Today Is About

Yesterday (Day 81) we built the error-recovery scaffolding: the failure taxonomy (hard, soft, partial), the validation checkpoint, and four recovery patterns. One of those patterns — "idempotent retry with budget" — got a single paragraph. Today it gets the whole email, because retry logic is where more agent pipelines quietly bleed money and reasoning quality than almost anywhere else.

The core claim: **in an agent system, retrying is not free, and "retry until it works" is an anti-pattern.** In a traditional microservice, retrying a failed call costs you latency and nothing else — the service is stateless, the retry is cheap, and eventually the transient blip clears. Agents break all three of those assumptions. A retry burns tokens. A retry can grow the orchestrator's context. And a retry against a *systematic* failure doesn't clear anything — it just fails again, more expensively.

A **retry budget** is the explicit, designed-in answer to the question "how many times, and at what cost, before I give up and escalate?"

---

## Why Retrying an Agent Is Not Like Retrying a Service

Let's make the difference concrete, because it's the whole reason this topic needs its own day.

```
                    MICROSERVICE RETRY          AGENT RETRY
                    ──────────────────────      ─────────────────────────────
Cost per attempt    Latency only                Tokens (prompt + output) —
                                                real money, every time

State impact        None (stateless)            Context can grow: failed
                                                attempt + retry prompt + new
                                                output all risk landing in
                                                the orchestrator's window

Does it converge?   Usually — transient         Only if the failure was
                    errors clear                transient. Systematic failures
                                                (bad prompt, missing data,
                                                model limitation) retry into
                                                the exact same wall.

"Best of N" trap    N/A                         If each retry hallucinates a
                                                DIFFERENT wrong value, picking
                                                the "best-looking" one is still
                                                wrong — and now you paid N times
```

The "best of N" trap deserves a flag. With a flaky network call, three retries give you three chances at the *same correct answer*. With a hallucinating subagent, three retries can give you three *different wrong answers*, and there's a real temptation to have the orchestrator pick the most plausible-looking one. That's not recovery — that's laundering a soft failure through repetition. This is exactly why the rule from Day 81 holds: **never auto-retry soft failures.** Retrying only makes sense when the failure is plausibly transient.

---

## The Three-Part Retry Budget

A retry budget isn't one number. It's three limits working together. If any one is hit, the pipeline stops retrying and routes to escalation.

```
┌─────────────────────────────────────────────────────────────┐
│  RETRY BUDGET                                                 │
│                                                              │
│  1. COUNT CAP     Hard failure:  retry ≤ 1                   │
│                   Soft failure:  retry = 0 (escalate)        │
│                   Partial:       re-request ≤ 1, else use    │
│                                  partial or escalate         │
│                                                              │
│  2. COST CAP      Track tokens spent on retries for this     │
│                   step. Stop at a ceiling (e.g. 2× the       │
│                   step's normal budget), even if count       │
│                   remains.                                    │
│                                                              │
│  3. CONTEXT CAP   Never append full failed outputs to the    │
│                   orchestrator. Summarize each failure to    │
│                   one line. Keep the raw output in the LOG,  │
│                   not in the WINDOW.                          │
└─────────────────────────────────────────────────────────────┘
         │
    any limit hit
         ▼
   ESCALATE (human review / fallback default / fail-fast signal)
```

### 1. The Count Cap

The count cap is the one people think of first, and it's the simplest. The defaults that hold up in practice:

- **Hard failures (timeout, 500, rate limit): retry once.** Transient infrastructure problems clear on a second attempt surprisingly often. A third attempt rarely adds signal — if two attempts failed, you're probably looking at something systematic (the service is down, not blipping).
- **Soft failures (wrong-but-well-formed output): retry zero times.** These need a human, or a different approach entirely. Retrying is the "best of N" trap.
- **Partial failures (missing a required field): re-request once, targeted.** Ask specifically for the missing field. If it comes back missing again, decide: is the partial result usable, or does this escalate?

### 2. The Cost Cap

The count cap alone isn't enough, because not all steps cost the same. A retry of a small read-only lookup is cheap; a retry of a 40K-token document-analysis subagent is not. A cost cap says: *regardless of count, stop spending on this step once you've burned, say, 2× its normal token budget.* This protects you from a scenario where a "1 retry" policy on an expensive step silently doubles your most costly operation across thousands of runs. Budget in tokens, not just attempts.

### 3. The Context Cap — The One Everyone Forgets

This is the subtle one, and it's the reason today isn't just "Day 81 part 2."

When a subagent fails and you retry, where does the failed attempt go? The naive implementation appends everything to the orchestrator's conversation: the failed output, the "that was wrong, try again" retry prompt, and the new output. Do that across three retries on two different subagents and you've injected six failed transcripts into the window that's supposed to be doing your high-level reasoning.

You've now traded a **reliability** problem for a **context quality** problem. The orchestrator is reasoning over a window half-full of garbage it produced while flailing. (Recall Day 11: the context window is your agent's RAM, and it's finite. Recall Day 14: context engineering is deciding what deserves to be in it. A pile of failed retries almost never does.)

The fix is a discipline: **failures live in the log, summaries live in the window.**

```
  ✗ DON'T (context bloat)              ✓ DO (context hygiene)
  ──────────────────────────          ──────────────────────────────
  orchestrator context:               orchestrator context:
    [full failed output #1, 800 tok]    "margin analyzer: attempt 1
    [retry prompt, 200 tok]              failed (timeout); attempt 2
    [full failed output #2, 800 tok]     failed (timeout); escalated."
    [retry prompt, 200 tok]              [1 line, ~20 tokens]
    [full failed output #3, 800 tok]
                                        (full transcripts → log file,
   ~2,800 tokens of noise               retrievable if a human needs
   degrading every subsequent           them, invisible to the model's
   reasoning step                       reasoning)
```

The orchestrator needs to *know* the step failed and *why*, at a summary level, to route correctly. It does not need to re-read the wreckage.

---

## The Escalation Decision: What "Give Up" Actually Means

"Escalate" is not "crash." When a retry budget is exhausted, the pipeline has three well-defined exits, and the right one depends on the stakes of the step:

**1. Fail-fast signal (for required, high-stakes steps).** Emit a structured `status: ESCALATED` result and stop the auto path. The margin analysis for an invoice about to be auto-approved is this case — no margin number, no auto-approval, full stop.

**2. Fallback default (for optional or low-stakes steps).** Substitute a safe default that routes conservatively. A failed risk-score subagent returns `risk_score: "unknown"`, which sends the item to human review rather than blocking the whole pipeline. The default is chosen for *safety*, not correctness.

**3. Graceful degradation (for steps the pipeline can survive without).** Continue the workflow with the remaining good outputs, but flag the gap. The email still drafts, marked "PENDING MARGIN CONFIRMATION." (This is Day 81's Pattern 2.)

The point: escalation is a *designed* branch, not the absence of a plan. Every subagent should have a documented "what happens when the budget runs out" answer before it ships.

---

## The Earnventory Example, End to End

Here's a full trace of a retry budget doing its job on the invoice pipeline:

```
STEP: Margin analyzer (read-only, idempotent → retry-eligible)

Attempt 1:  API timeout (hard failure).
            COUNT: 1 used, 1 remaining. COST: within cap.
            → Retry allowed. Log: "margin: attempt 1 timeout."
            (Context gets 1 line, not the stack trace.)

Attempt 2:  API timeout again (hard failure).
            COUNT: cap reached (1 retry max for hard failure).
            → Stop. Do NOT attempt 3.
            Log: "margin: attempt 2 timeout, budget exhausted."

Escalation: This is a required, high-stakes step → fail-fast.
            - approve_invoice: NOT called.
            - Email drafts with template=FLAG_FOR_REVIEW.
            - flag_for_review fired with failure context attached.
            - Orchestrator context, total footprint for this failure:
              "margin analyzer: 2 attempts failed (timeout),
               escalated to human review." ← one line

Observability:
            - Increment margin_analyzer.hard_failure_count.
            - If hard-failure rate > threshold over 24h → alert
              (the API is degraded, not just blipping — a
               root-cause problem no retry budget can fix).
```

Compare this to the no-budget version: retry 5×, burn 5× the tokens, inject 5 timeout transcripts into context, and *still* escalate at the end — having spent more money and degraded the orchestrator's reasoning to arrive at the same place. The budget gets you to the same correct outcome, cheaper and cleaner.

---

## A Note on Idempotency (So Retries Don't Cause the Damage)

One hard rule underlies all of this, carried over from Day 81: **only retry idempotent operations.** A read (`get_supplier_pricing`, `fetch_invoice`) is safe to repeat — same call, same effect. A write (`send_purchase_order`, `approve_invoice`) is not — retry it blindly and you may send two POs. Before any retry of a state-changing action, you must confirm the first attempt didn't actually succeed (e.g., check for the record it would have created). When in doubt, treat writes as non-retryable and escalate instead. A retry budget applied to a non-idempotent action isn't a safety feature — it's a duplication bug waiting to happen.

---

## What to Apply to Earnventory Now

1. **Give every retry-eligible step an explicit count cap.** Write it down: hard failures ≤ 1, soft failures = 0. Make "retry forever" impossible by construction.
2. **Add a cost cap to expensive steps.** For any subagent that processes large inputs, cap retry token spend at a multiple of its normal budget so a retry policy can't silently double your most expensive operation at scale.
3. **Audit where failed attempts go.** Trace one failing run. If full failed outputs are ending up in the orchestrator's context, that's a leak — route them to the log and put a one-line summary in the window instead.
4. **Instrument retry rates per step.** A step retried on more than ~5% of runs isn't a retry-budget problem — it's a root-cause problem (bad prompt, degraded tool, model mismatch). The budget contains the symptom; the metric tells you to fix the disease.

---

## Free Resources

- **AWS Builders' Library — "Timeouts, retries, and backoff with jitter":** The canonical treatment of retry budgets, exponential backoff, and why unbounded retries cause cascading failure. Written for services, but the retry-budget reasoning transfers directly to agents. https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- **Anthropic's "Build robust agentic systems" guide:** Covers idempotency, human-in-the-loop escalation, and the minimal-footprint principle that underpins safe retries of state-changing actions. https://docs.anthropic.com/en/docs/build-with-claude/agentic-and-multi-agent — ⚠️ Verify current URL; Anthropic reorganizes docs periodically.

---

*Tomorrow: circuit breakers — when a subagent is failing often enough that the right move isn't to retry it, but to stop calling it entirely for a while.*
