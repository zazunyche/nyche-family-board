# AI Agents Day 81: Error Recovery — Designing Pipelines That Degrade Gracefully

**Mini-Module 1.3 — Context, Memory, and State | Day 81 of the extended series**

---

## What Today Is About

Days 79 and 80 covered trust failures — how prompt injection can travel through a subagent and into the orchestrator. Today we go sideways: what happens when a subagent doesn't get attacked, it just *fails*? Timeouts. Malformed output. Hallucinated values. Missing fields. These are the everyday reliability problems that kill production agent systems, and they're often harder to handle than security attacks because they're subtle, intermittent, and look like success.

The design question for today: **How should your pipeline behave if any one node returns garbage?** If you don't have an explicit answer, the default is "crash or silently corrupt downstream output." Neither is acceptable in production.

---

## The Failure Taxonomy: Three Types, Three Responses

Not all subagent failures are the same. Treating them the same is the first mistake.

```
FAILURE TYPE       WHAT IT LOOKS LIKE               WHY IT'S HARD
──────────────     ──────────────────────────────   ─────────────────────────────────────
Hard failure       Exception, timeout, HTTP 500,     Easy to detect. Hard part: deciding
                   API rate limit, tool error         what to do next (retry? escalate?
                                                      fall back to a default?)

Soft failure       Output returned, looks fine,       The dangerous one. No exception was
                   but the values are wrong           raised. The orchestrator trusts it.
                   (hallucinated, stale, confabulated) Corruption propagates invisibly.

Partial failure    Correct, but incomplete.           Usable? Maybe. Depends on which
                   Missing fields, truncated,          fields are missing. Requires a
                   off-format, extra fields added      decision, not just detection.
```

Hard failures are the easy case in one sense: something visibly broke. You caught an exception. You got a non-200 status code. You know to stop. The hard part is knowing what to do next — and we'll get to that.

Soft failures are the dangerous case. Your invoice analysis subagent runs without error, takes 4 seconds, and returns a beautifully formatted JSON blob. It says `"margin_impact": 0.18`. It's wrong. The model hallucinated that value from its training data. Nothing in your infrastructure flagged it. Three steps later, your orchestrator auto-approves a purchase order based on that margin figure. That's a soft failure, and it's what good agent design prevents.

Partial failures sit in the middle. The output is real, some of it is correct, but it's missing the `supplier_risk_score` field you needed. Do you proceed without it? Do you re-request? Do you escalate? The answer depends on whether that field is required or optional for the next step — which means your pipeline has to know.

---

## The Validation Layer: Your First Line of Defense

Every subagent output should cross a **validation checkpoint** before it enters the orchestrator's reasoning. Not a loose check. A strict schema parse.

Here's the pattern in concrete terms:

```
ORCHESTRATOR receives subagent result
         │
         ▼
  ┌──────────────────────┐
  │  VALIDATION LAYER    │
  │                      │
  │  1. Type-check all   │
  │     fields           │
  │  2. Range-check      │
  │     numeric values   │
  │  3. Presence-check   │
  │     required fields  │
  │  4. Sanity-check     │
  │     logical coherence│
  └──────────────────────┘
         │
    ┌────┴────────────────────┐
    │                         │
PASSES                     FAILS
    │                         │
    ▼                         ▼
Enters orchestrator    VALIDATION_FAILED signal
reasoning                  → log failure type
                           → route to recovery path
```

In the Earnventory context, the margin analysis subagent returns:

```json
{
  "sku": "BOTTLE-RIOJA-750",
  "supplier_price": 14.20,
  "margin_impact": "significant",
  "recommendation": "approve"
}
```

The validation layer sees `"margin_impact": "significant"` where it expects a float between -1.0 and 1.0. It raises `ValidationError: margin_impact must be numeric`. The orchestrator never sees this result. Instead, it sees:

```json
{
  "subagent": "margin-analysis",
  "status": "VALIDATION_FAILED",
  "error": "margin_impact type mismatch: expected float, got string",
  "raw_output_logged": true
}
```

Now the orchestrator can reason about the failure explicitly — not silently corrupt its downstream decision.

The implementation detail worth noting: `additionalProperties: false` in your JSON schema (which you saw in Day 80) enforces this at the parsing level. Anything not in the schema definition gets rejected, not silently discarded.

---

## Why Agents Are Harder to Recover Than Microservices

If this were a microservice architecture, the answer to most failures is simple: retry with exponential backoff. Services are stateless; retrying costs only latency.

In an agent pipeline, blind retrying has three costs that compound:

**1. Token cost.** Each retry to a subagent burns tokens — both the prompt and the output. If you're retrying five times because a subagent keeps hallucinating, you've spent 5× the token budget for that step. In a long pipeline, that compounds.

**2. Context cost.** Every retry can add content to the orchestrator's context: the failed attempt, the retry prompt, the new result. Over multiple retries across multiple subagents, context bloat degrades the orchestrator's own reasoning quality. You solve a reliability problem by introducing a context quality problem.

**3. Correlation risk.** If the failure is caused by something systematic — a bad system prompt, a tool that's returning stale data, a model that doesn't have the information it needs — retrying doesn't fix it. You retry into the same failure. Worse, if you retry and get a *different* hallucinated value each time, you might pick the "best-looking" one, which is still wrong.

This is why retry logic in agents should be thoughtful, not reflexive. The rule of thumb: **retry at most once on hard failures, and only after diagnosing the cause. Never auto-retry soft failures — they need human escalation.**

---

## Recovery Patterns That Actually Work

Given that reflexive retrying is risky, here are four recovery patterns that are architecturally sound:

**Pattern 1: Fail-fast with explicit signal**

The simplest and most underused pattern. When a subagent fails, don't silently proceed. Raise an explicit, structured failure signal that the orchestrator can route on. "I don't know" is a valid subagent response. Baking that in is better than having the model confabulate.

```
system_prompt addition:
"If you cannot compute a reliable answer for any required field, 
return: {'status': 'insufficient_data', 'missing': ['field_name']}.
Never hallucinate values for required fields."
```

**Pattern 2: Graceful degradation with partial results**

Sometimes a pipeline can continue with a subset of subagent outputs. Your invoice pipeline has three subagents: data fetch, margin analysis, and email draft. If the margin analysis fails, can you still generate the email — but flag it as "PENDING MARGIN CONFIRMATION" rather than cancelling the whole workflow? Often yes. Design for it explicitly.

```
FULL SUCCESS:      all 3 subagents pass → auto-approve path available
PARTIAL SUCCESS:   2/3 pass, 1 fails → human review path, flagged
TOTAL FAILURE:     0-1/3 pass → escalate, no auto-anything
```

This is the difference between "an agent that's down if any subagent fails" and "an agent that degrades gracefully."

**Pattern 3: Idempotent retry with budget**

When you do retry, make it safe. Idempotency means retrying the same request produces the same effect — specifically, it doesn't double-execute irreversible actions. Never retry a `send_purchase_order` call without confirming it didn't succeed the first time. Do retry a `get_supplier_pricing` call — it's read-only and safe to repeat.

Budget your retries: one retry max for hard failures (network issues, transient errors). Log and escalate if it fails again. No retry for soft failures. The retry budget is part of the pipeline design, not an afterthought.

**Pattern 4: Structured fallback defaults**

For optional or low-stakes subagent outputs, define a safe default. If the risk-scoring subagent fails, the default is `risk_score: "unknown"` — which routes the invoice to human review rather than crashing or auto-approving. The fallback is designed for safety, not for correctness.

---

## The "What Could Go Wrong Here?" Design Exercise

The most useful thing you can do before deploying an agent pipeline is a structured failure analysis. For every subagent:

1. What are the hard failure modes? (timeout, API error, exception)
2. What are the soft failure modes? (hallucinated values, stale data, wrong format)
3. What are the partial failure modes? (missing fields, truncated output)
4. For each: what's the recovery path? (retry, fallback, escalate, hold for human)
5. For each: can the downstream step proceed without this subagent's output?

Doing this exercise for your Earnventory invoice pipeline would look like:

```
SUBAGENT              HARD FAIL          SOFT FAIL              RECOVERY
────────────────────  ─────────────────  ─────────────────────  ────────────────────
Invoice fetcher       API timeout        Returns wrong invoice  Retry once; escalate
Margin analyzer       API rate limit     Hallucinated margin    Never retry; flag
Email drafter         Model error        Off-tone, wrong data   Retry once; human edit
```

Notice that "margin analyzer" gets a stricter policy than the others. The consequence of a wrong margin value is higher (a financial decision gets made on bad data), so the policy is tighter: never auto-retry, always flag.

---

## The Earnventory Example, End to End

Here's how a well-designed Earnventory invoice pipeline handles a soft failure in the margin analysis subagent:

```
1. Invoice fetcher returns valid data (passes validation).
   Orchestrator logs: subagent_1=PASS

2. Margin analyzer returns:
   {"margin_impact": "significant", "recommendation": "approve"}
   Validation: FAIL — margin_impact is string, expected float.
   Orchestrator logs: subagent_2=VALIDATION_FAILED

3. Recovery path triggered:
   - Email drafter still runs — but with template="FLAG_FOR_REVIEW"
   - Draft email says: "Invoice BATCH-2847 ready for review.
     Margin analysis unavailable. Manual confirmation required."
   - approve_invoice tool NOT called.
   - flag_for_review tool called with failure context attached.

4. Human reviews:
   - Sees the invoice, the fetched data, the margin failure reason.
   - Approves or rejects with full context.

5. Pipeline logs failure for analysis:
   - Margin analyzer soft failure rate trending up?
     → Check if model or tool needs updating.
```

The key insight: the pipeline completed. It didn't auto-approve on bad data. It didn't crash. It degraded to a human-review path and surfaced the right information to the human. That's production-grade error recovery.

---

## What to Apply to Earnventory Now

Three concrete things you can implement immediately:

1. **Add output validation to any subagent call in your codebase.** Parse the JSON against your expected schema before letting it flow downstream. Fail fast, log the raw output, route explicitly.

2. **Define your graceful degradation paths.** For each subagent: what does the pipeline do if it fails? "Crash" is not an answer. "Escalate to human review with context" is.

3. **Instrument your retry logic.** Count retries per subagent per day. If a subagent is being retried more than 5% of the time, that's a signal to investigate the root cause — not to just increase the retry budget.

---

## Free Resources

- **"Building Fault-Tolerant LLM Applications" — LangChain blog:** Practical patterns for fallback chains, retry logic, and output validation in agent pipelines. Covers the same failure taxonomy from an implementation angle.
- **Anthropic's "Build robust agentic systems" guide:** https://docs.anthropic.com/en/docs/build-with-claude/agentic-and-multi-agent — Includes the minimal footprint principle and human-in-the-loop escalation patterns; directly relevant to the recovery architecture above. ⚠️ Verify current URL — Anthropic reorganizes docs occasionally.

---

*Tomorrow: retry budgets — when to try again, when to escalate, and how to keep context from bloating when failures stack up.*
