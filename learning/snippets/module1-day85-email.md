# AI Agents Day 85: Load Shedding — Dropping Work on Purpose So the System Stays Alive

**Day 85 | Production Reliability thread | AI Agents Curriculum for Dad**

---

## Where We Left Off

The last three days built defenses against a *single* misbehaving dependency:

- **Day 82 — Retry budgets:** cap how many times one failed call may try again.
- **Day 83 — Circuit breakers:** stop calling a dependency that's clearly *down*.
- **Day 84 — Bulkheads:** wall off one *slow* dependency so it can't starve unrelated workloads.

Every one of those assumes the trouble is localized — one sick subagent, one degraded API, one leaky pool. Today we confront the opposite situation: **nothing in particular is broken, but demand has simply exceeded what the whole system can serve.** Requests are arriving faster than you can finish them. No bulkhead helps, because *every* compartment is full. No circuit breaker trips, because no dependency is failing — you just have too much work.

This is the overload problem, and the counterintuitive fix is: **deliberately throw some work away.**

---

## The Problem: Accepting Everything Is How You Get Nothing

The naive instinct under overload is to accept every request and let a queue absorb the surge. This feels responsible — "we'll get to all of it." It's actually the mechanism of collapse.

Here's why. Suppose your agent can complete **100 tasks/minute**, and traffic spikes to **150 tasks/minute arriving.** If you accept all 150, the extra 50/minute don't vanish — they pile into a queue that grows by 50 every minute, forever. And a growing queue means growing *wait time*: each new request sits behind an ever-longer line before it even starts.

```
ACCEPT-EVERYTHING UNDER OVERLOAD (capacity 100/min, arrivals 150/min)

  minute:   1     2     3     4     5
  queue:   +50  +100  +150  +200  +250   ← grows without bound
  wait:    30s   60s   90s  120s  150s   ← every request slower
                                    │
                                    ▼
              By the time a task reaches a worker, the caller
              has already timed out and given up. You did the
              work — and threw the RESULT away. Zero goodput,
              full effort. The system is "busy" and useless.
```

This is the crucial distinction between **throughput** and **goodput**:

- **Throughput** = work the system *performs*.
- **Goodput** = work the system performs *that's still useful when it finishes*.

Under uncontrolled overload, throughput stays pegged at 100% (the machines are pinned, doing constant work) while **goodput collapses toward zero** — because everything completes *after* its caller has timed out. You are running as hard as possible to produce results nobody is still waiting for. That's the trap: a maximally-busy system delivering nothing.

```
      goodput
        ▲
   100% ┤        ___________
        │       /           \
        │      /             \        ← past the knee, MORE load
        │     /               \          means LESS useful output
        │    /                 \____
        │   /                       \_______
      0 ┼──┴────────────────────────────────► offered load
           healthy   │  knee  │   overload (collapse)
```

The goal of load shedding is to keep you at the top of that curve — near the "knee" — instead of sliding down the far side into congestion collapse.

---

## The Fix: Shed Early, Shed Cheap, Shed by Priority

**Load shedding** is admission control under stress: when incoming demand exceeds capacity, you *refuse* some work immediately rather than accept work you can't finish in time. Three principles make it effective.

**1. Shed early and cheaply.** The single most important property: reject *before* you've spent real resources. A request you decline in 5ms — before it grabs a worker slot, a DB connection, or an LLM call — costs you almost nothing and frees that capacity for work you *will* complete. The disaster is doing 29 seconds of expensive work and *then* discovering the caller is gone. Reject at the front door, not after you've cooked the meal.

**2. Shed by priority, not at random.** Overload is exactly when you should be *most* deliberate about what survives. Rank work by value and drop from the bottom up:

```
PRIORITY LADDER (shed from the bottom when overloaded)

  KEEP ALWAYS  ┤ payment confirmation, live reorder decisions,
               │ fraud/anomaly alerts         ← revenue & safety
               ├─────────────────────────────────────────────
  SHED LATE    ┤ dashboard queries, on-demand lookups
               ├─────────────────────────────────────────────
  SHED EARLY   ┤ bulk report emails, analytics refresh,
               │ speculative prefetch, "nice to have" summaries
               └─────────────────────────────────────────────
                 ▲ first to go — deferrable, low regret
```

**3. Shed honestly and fast.** When you refuse, tell the caller *now* with a cheap, clear signal — an HTTP `503` with a `Retry-After` header, a "system busy, try again shortly" message, a queued-for-later acknowledgment. A fast, honest rejection lets the caller back off and retry sanely. A slow acceptance that silently fails 30 seconds later is far worse for everyone.

---

## A Worked Earnventory Scenario

It's Black Friday. The inventory agent normally handles a calm trickle of work; now orders, price checks, dashboard refreshes, and report emails all spike at once. Offered load hits ~180% of capacity.

```
WITHOUT LOAD SHEDDING
────────────────────────────────────────────────────────────
• Every request accepted → queues balloon across the board.
• A live reorder decision now waits behind 400 queued
  analytics refreshes and bulk report emails.
• Payment confirmations time out. Customers retry → MORE load.
• System is pinned at 100% CPU producing stale, timed-out
  results. Effective output: ~nothing. Total brownout.
────────────────────────────────────────────────────────────

WITH PRIORITY LOAD SHEDDING
────────────────────────────────────────────────────────────
• Front-door admission check sees load > threshold.
• SHED EARLY:  analytics refresh + bulk report emails →
               rejected instantly with "deferred, will run
               tonight." Cost to reject: microseconds.
• SHED LATE:   ad-hoc dashboard queries → "system busy,
               retry in 30s" (503 + Retry-After).
• KEEP ALWAYS: reorder decisions, payment confirmations,
               fraud alerts → full capacity, complete on time.
• Result: the business-critical path stays healthy. The
  degradation is real but CHOSEN, and it lands on the work
  that could most afford to wait.
────────────────────────────────────────────────────────────
```

Same overload. Without shedding it's an indiscriminate brownout where the most important work drowns alongside the least. With shedding it's a *graceful* degradation: you sacrifice the analytics refresh so the checkout path survives. You decided the casualties in advance, instead of letting the queue decide them at random.

---

## How Do You Know You're Overloaded? (The Signals)

Load shedding needs a trigger — a live read on "am I past capacity right now?" Common signals, roughly in order of usefulness:

- **Queue depth / wait time.** The best early-warning sign. If the time a task spends *waiting* before it starts exceeds its deadline, shedding it now saves wasted work. Many systems shed based directly on "estimated wait > timeout."
- **In-flight concurrency vs. a ceiling.** Already at your max simultaneous tasks (or token-per-minute budget)? New arrivals get shed.
- **Resource saturation.** CPU, memory, connection-pool utilization crossing a high-water mark.
- **Latency creep.** Rising p99 latency is often the first visible symptom that you're approaching the knee.

A subtle but important refinement: **shed based on whether a request can still be served *in time*, not just on raw load.** A task that arrives with a 2-second deadline into a queue that's 5 seconds deep is already doomed — dropping it immediately is strictly better than running it. This is sometimes called *deadline-aware* shedding, and it's how you avoid the "throughput without goodput" trap directly.

---

## Load Shedding vs. Its Cousins

It's worth placing this precisely against the neighbors, because they're easy to conflate:

```
┌────────────────┬──────────────────────┬─────────────────────────┐
│ Mechanism      │ Triggers on…         │ Does what               │
├────────────────┼──────────────────────┼─────────────────────────┤
│ Circuit breaker│ a DEPENDENCY is down │ stop calling THAT dep   │
│ Bulkhead       │ (preemptive)         │ isolate one workload's  │
│                │                      │ resources from others   │
│ Rate limiting  │ a client exceeds its │ enforce a fairness/quota│
│                │ allotted quota       │ contract (per-caller)   │
│ Load shedding  │ TOTAL load > your    │ drop lowest-value work  │
│                │ own capacity         │ to protect the rest     │
└────────────────┴──────────────────────┴─────────────────────────┘
```

The sharpest contrast is **rate limiting vs. load shedding.** Rate limiting is about *fairness*: "you, client X, may send 100/min — no more, even if I'm idle." It's a contract, enforced per-caller, regardless of your health. Load shedding is about *survival*: "I don't care who you are; right now I'm over capacity, so I'm dropping low-priority work until I recover." One protects other clients from a greedy one; the other protects *the system itself* from the aggregate. Mature systems run both.

---

## The Tradeoffs and the Failure Modes

Shedding is powerful but has sharp edges worth naming:

- **You need a priority signal to shed well.** If every request looks identical, you can only shed randomly — better than collapse, but far weaker than shedding by value. This is a design-time investment: tag work with priority/deadline *before* you're on fire, because you can't infer it mid-incident.
- **Shed too aggressively and you waste capacity.** Set the threshold too low and you reject work you could actually have served, leaving the system under-utilized. Too high and you shed too late, after the queue has already blown up. The threshold is a tunable you calibrate against real traffic.
- **Retry storms can weaponize your own rejections.** If every shed request immediately retries, your "cheap rejection" becomes a flood of new arrivals — you shed 50, they all come back next second, and now you're shedding 100. This is why the *client* side matters: shed responses must carry `Retry-After` and clients must honor it with **exponential backoff and jitter** (a callback to the retry-budget discipline from Day 82). Shedding on the server and backoff on the client are two halves of one contract.
- **Silent shedding hides problems.** If you drop work without logging *what* and *how much*, overload becomes invisible — the dashboards look calm because the hard requests never made it in. Always emit metrics on shed volume and shed priority; a rising shed rate is a capacity-planning signal, not just an incident symptom.

---

## The Analogy, Spelled Out

The term is borrowed directly from electrical power grids, and the borrowing is exact. A grid must match generation to demand in real time — supply and load have to balance, or the whole grid's frequency drifts and it risks a cascading, total blackout. When a heat wave pushes demand past what the utility can generate, it doesn't let the entire grid collapse. It performs **load shedding**: deliberately cutting power to selected neighborhoods — rolling blackouts — to bring load back under supply.

The logic is precisely ours: a few dark blocks for an hour is vastly better than an uncontrolled, region-wide blackout that takes days to restart (a "black start" is genuinely hard). The utility *chooses* who goes dark, *when*, and for *how long* — a deliberate, prioritized, temporary sacrifice of part to save the whole. And critically, they plan the shed *before* the heat wave, deciding in advance which circuits are non-critical (a shopping mall's decorative lighting) and which are protected (a hospital). Your agent should make the same decision the same way: pick your rolling-blackout list before Black Friday, not during it.

---

## The One-Sentence Takeaway

> When demand exceeds capacity, accepting everything is how you deliver nothing — load shedding is the discipline of rejecting low-value work early and cheaply, so the capacity you have is spent only on work that will still be useful when it finishes.

---

## Free Resources

1. **Google SRE Book — "Handling Overload" (Chapter 21).** The definitive engineering treatment: goodput vs. throughput, shedding by request criticality, deadline-aware rejection, and the retry-amplification trap — all from running some of the largest systems in the world. Free online: https://sre.google/sre-book/handling-overload/

2. **AWS Builders' Library — "Using load shedding to avoid overload" (David Yanacek).** A practical, diagram-rich field guide to shedding at the front door, prioritizing by cost-to-reject, and why rejecting cheaply is the whole game. https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/

---

*Day 85 | Production Reliability thread | AI Agents Curriculum — Designed by Abeiku for Dad*
