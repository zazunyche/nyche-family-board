# AI Agents Day 83: Circuit Breakers — Stop Calling What's Already Down

**Day 83 | Production Reliability thread | AI Agents Curriculum for Dad**

---

## Where We Left Off

Yesterday (Day 82) we covered **retry budgets**: the discipline of deciding, in advance, how many times a *single* failed call is allowed to try again before you give up and escalate. Retry once for a transient timeout; don't jack the car up for a second flat.

But retry budgets have a blind spot. They reason about *one call at a time*. They have no memory across calls. If your supplier-pricing subagent is genuinely down — not blipping, but *down* — a per-call retry budget of "1 retry" still means every single one of your 40 pending orders will independently try, fail, wait, retry, and fail again before escalating. Forty orders × two attempts × a 30-second timeout each is twenty minutes of wall-clock latency spent discovering the same fact forty times over: *the pricing service is down.*

That's the gap circuit breakers fill. A retry budget protects a single call from a transient failure. A **circuit breaker** protects the *whole system* from a *sustained* one.

---

## The Core Idea

A circuit breaker is a small piece of stateful machinery that sits between a caller and a dependency (an API, a tool, a subagent). It watches the outcomes of calls flowing through it and keeps a running tally. When failures cross a threshold, it stops letting calls through at all — it "trips open" — and returns an immediate failure without touching the dependency.

The insight is counterintuitive at first: **when something is failing, the most reliable action is to stop calling it.**

This does three things at once:

1. **Fails fast.** Callers get an instant "unavailable" instead of waiting out a 30-second timeout. Latency stays bounded even when a dependency is dead.
2. **Stops the hammering.** A struggling service that's overloaded gets *breathing room* to recover instead of being pounded by retry traffic — which often is what's keeping it down.
3. **Saves resources.** In an agent system, every failed call to a subagent still costs tokens (the prompt was sent, context was built, maybe a partial response streamed). Failing fast means you stop paying for calls that can't succeed.

---

## The Three States

A circuit breaker is a tiny state machine with exactly three states. This is the whole model — internalize it and you understand the pattern.

```
                    failures ≥ threshold
      ┌──────────┐ ──────────────────────►  ┌──────────┐
      │  CLOSED  │                           │   OPEN   │
      │ (normal) │                           │(fail fast)│
      │          │ ◄──────────────────────   │          │
      └──────────┘   probe succeeded         └──────────┘
           ▲                                       │
           │                                       │ cooldown
           │ probe succeeded                       │ elapsed
           │                                       ▼
           │                                 ┌──────────┐
           └──────────────────────────────  │HALF-OPEN │
                                             │(one probe)│
              probe failed ────────────────► └──────────┘
                        (back to OPEN)
```

**CLOSED** — the normal, healthy state. Calls pass straight through to the dependency. The breaker just counts failures. Each success resets (or decrements) the counter; each failure increments it. As long as failures stay below the threshold, nothing changes.

**OPEN** — the tripped state. The failure threshold was crossed. Now calls do **not** reach the dependency at all. Every call returns immediately with a failure (or, better, a fallback — more on that below). The breaker starts a cooldown timer. This is the state that saves you: no latency, no hammering, no wasted tokens.

**HALF-OPEN** — the cautious recovery state. When the cooldown elapses, the breaker doesn't immediately declare the dependency healthy — that would risk slamming a still-broken service with the full backlog. Instead it allows exactly **one** probe call through. If that probe succeeds, the breaker closes and normal traffic resumes. If it fails, the breaker snaps back to OPEN and waits out another cooldown.

That single-probe half-open step is the elegant part. It tests the water with one toe instead of diving back in with the whole system.

---

## A Worked Earnventory Scenario

Say your inventory agent processes a batch of 40 reorder decisions every afternoon. Each decision calls a `get_supplier_pricing` subagent that queries an external supplier API to fetch current unit costs.

At 2:00pm, the supplier's API goes down for maintenance. Here's the difference the breaker makes:

```
WITHOUT A CIRCUIT BREAKER
─────────────────────────────────────────────────────────────
Order 1  → call pricing → timeout 30s → retry → timeout 30s → escalate
Order 2  → call pricing → timeout 30s → retry → timeout 30s → escalate
Order 3  → call pricing → timeout 30s → retry → timeout 30s → escalate
   ...        (× 40 orders, each independently discovering the outage)
Order 40 → call pricing → timeout 30s → retry → timeout 30s → escalate

Total: ~40 min of stalled latency. 80 doomed API calls.
Tokens burned building context for 80 subagent invocations
that never had a chance.
─────────────────────────────────────────────────────────────

WITH A CIRCUIT BREAKER (threshold = 5, cooldown = 60s)
─────────────────────────────────────────────────────────────
Order 1–5  → call pricing → timeout → ... → 5th failure TRIPS breaker
Order 6–40 → breaker is OPEN → return INSTANTLY:
             "pricing unavailable — using cached rate + flag for review"

Meanwhile, once per 60s: HALF-OPEN probe tests the API.
At 2:07pm the API recovers → next probe succeeds → breaker CLOSES.
Orders resume live pricing automatically.

Total: ~2.5 min of latency (the first 5 timeouts). 35 orders served
instantly from fallback. ~6 probe calls during the outage.
─────────────────────────────────────────────────────────────
```

Same outage. One design spends forty minutes and eighty wasted calls rediscovering it; the other spends two and a half minutes learning it *once* and then routes around it — and heals itself the moment the dependency returns, with no human in the loop.

---

## The Fallback Question: What Do You Return When Open?

An open breaker has to return *something*. There are three honest options, in rough order of preference:

1. **Serve a fallback.** Return degraded-but-usable data: a cached price from this morning, a conservative default, last-known-good. Flag it as degraded so downstream logic (and humans) know not to fully trust it. This is what keeps the system *useful* during an outage instead of merely *failing politely*.

2. **Fail fast and explicit.** Return a clear "dependency unavailable" that the orchestrator can reason about — e.g., defer that specific order to a review queue rather than guessing. Better than a fallback when a wrong value is worse than no value (pricing that drives an irreversible payment, say).

3. **Queue for later.** Park the request and replay it once the breaker closes. Good for non-urgent work; bad when the caller needs an answer now.

The one option that is *never* right is the silent one: an open breaker returning a fallback that looks identical to live data with no marker. That turns a visible outage into an invisible data-quality bug — exactly the "accepted-but-wrong, and nobody notices" failure mode we've flagged all week.

---

## Tuning the Two Knobs

A circuit breaker has essentially two parameters, and both are judgment calls, not defaults to copy:

**Failure threshold** — how many failures trip it. Too low (say, 1) and a single transient blip opens the circuit and needlessly degrades everyone. Too high (say, 50) and you eat a lot of latency before protection kicks in. A common shape is "5 failures in a row" or "50% failure rate over the last 20 calls." Rate-based thresholds handle intermittent flakiness better than consecutive-count thresholds.

**Cooldown duration** — how long to stay open before probing. Too short and you probe a still-broken service constantly, providing little relief. Too long and you stay degraded well after the dependency has recovered. Sixty seconds is a reasonable start; some systems use exponential backoff on the cooldown itself (30s, then 60s, then 120s) so a persistently-dead dependency gets probed less and less often.

```
THE TWO FAILURE MODES OF BAD TUNING

Threshold too LOW / cooldown too LONG:
  → over-eager. Trips on noise, stays degraded too long.
  → symptom: "why is it using cached prices? the API was fine!"

Threshold too HIGH / cooldown too SHORT:
  → under-protective. Eats latency, hammers the sick service.
  → symptom: "the outage lasted 40 min but the breaker barely helped."
```

---

## How This Composes With Yesterday

Circuit breakers and retry budgets are not competitors — they're layers, and they stack cleanly:

```
Single call fails
      │
      ▼
RETRY BUDGET decides: is this a transient blip worth one more try?
      │  (yes → retry once; still fails → give up on THIS call)
      ▼
CIRCUIT BREAKER decides: are TOO MANY calls failing lately?
      │  (yes → trip open; short-circuit the NEXT calls entirely)
      ▼
FALLBACK / ESCALATION decides: what do we serve in the meantime?
```

Retry budget = protect the individual call. Circuit breaker = protect the aggregate system. Fallback = stay useful while protected. Three small mechanisms, one resilient pipeline.

---

## The Analogy, Spelled Out

The name isn't a metaphor — it's borrowed directly from the electrical panel in your basement. A house breaker exists because when a circuit shorts, the *worst* thing the wiring can do is keep pushing current through the fault. That's how you melt insulation and start fires. So the breaker does the counterintuitive thing: it *cuts the power fast*. And it does not sit there flipping itself on and off hopefully — it stays off until a human deliberately resets it, having presumably fixed the cause.

A software circuit breaker is the same instinct with one upgrade: the half-open probe lets it reset *itself* cautiously, testing once before restoring full load. But the core wisdom is identical — **when a path is faulting, the safe move is to stop energizing it, not to keep trying.**

---

## The One-Sentence Takeaway

> A retry budget asks "should I try this call again?"; a circuit breaker asks "should I stop trying this dependency altogether for a while?" — and knowing when to *stop* calling is what keeps one sick component from dragging down the whole system.

---

## Free Resources

1. **Martin Fowler, "CircuitBreaker"** — the canonical, still-best explanation of the pattern, with the three-state diagram and sample code. Written for microservices, but every concept maps directly onto agent-to-subagent calls:
   https://martinfowler.com/bliki/CircuitBreaker.html

2. **AWS Builders' Library, "Timeouts, retries, and backoff with jitter"** — the production reasoning behind why retries alone overload struggling dependencies, and why you need a higher-level guard like a breaker. Excellent on the interaction between the two mechanisms:
   https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/

---

*Day 83 | Production Reliability thread | AI Agents Curriculum — Designed by Abeiku for Dad*
