# AI Agents Day 84: Bulkheads — Isolating Failure So One Sick Subagent Can't Sink the System

**Day 84 | Production Reliability thread | AI Agents Curriculum for Dad**

---

## Where We Left Off

The last two days built a pair of complementary reflexes for handling a dependency that *fails*:

- **Day 82 — Retry budgets:** decide in advance how many times a *single* failed call may try again before you give up. Protects the individual call from a transient blip.
- **Day 83 — Circuit breakers:** watch the aggregate failure rate and, once a dependency is clearly *down*, stop calling it entirely for a cooldown window. Protects the whole system from a *sustained* outage.

Both of those mechanisms trigger on **failure** — a timeout, an error, a 429. But there's a nastier failure mode that neither one catches cleanly, because it doesn't look like failure at all.

It looks like *success, but slow.*

---

## The Problem: Slow Is Worse Than Down

A dependency that's cleanly *down* is almost easy — it errors fast, your circuit breaker trips, you route around it. The dangerous case is a dependency that's **degraded**: still returning correct answers, still returning `200 OK`, but taking 30 seconds instead of 300 milliseconds.

Nothing errors. The circuit breaker never trips, because from its point of view every call *succeeds*. The retry budget never engages, because nothing failed. And yet your system can grind to a complete halt. Here's the mechanism.

Almost every agent runtime has some **shared, finite pool of concurrency** — a fixed number of worker slots, a cap on simultaneous in-flight requests, a connection pool, or a token-per-minute budget. This is deliberate: unbounded concurrency is its own failure mode. Say your inventory agent runs on a pool of **10 worker slots**, and every task — pricing lookups, low-stock emails, inventory queries, supplier notifications — draws from that same pool of 10.

Now the supplier pricing API degrades. It doesn't fail; it just answers in 30 seconds instead of instantly.

```
SHARED POOL — 10 slots, all task types compete for the same slots

  time →
  slot 1  [ pricing... 30s ..................... ]
  slot 2  [ pricing... 30s ..................... ]
  slot 3  [ pricing... 30s ..................... ]
  slot 4  [ pricing... 30s ..................... ]
  slot 5  [ pricing... 30s ..................... ]
  slot 6  [ pricing... 30s ..................... ]
  slot 7  [ pricing... 30s ..................... ]
  slot 8  [ pricing... 30s ..................... ]
  slot 9  [ pricing... 30s ..................... ]
  slot 10 [ pricing... 30s ..................... ]
          ▲
          all 10 slots occupied by slow pricing calls

  QUEUED, STARVING:  low-stock email · inventory query · supplier
                     notification · reorder alert · ...
                     (none of which need pricing at all)
```

Pricing tasks arrive faster than they drain (because each holds a slot for 30s), so they steadily consume every slot. The moment all 10 are held, **everything else queues** — including tasks that have nothing to do with pricing. Your low-stock alert emails, which take 200ms and don't touch the pricing API at all, now wait behind a wall of stalled pricing calls.

One degraded dependency has taken down the *entire* agent. This is called **resource exhaustion by a noisy neighbor**, and it's one of the most common ways production systems fall over. The failure wasn't in the email path — it was in the *shared pool* the email path happened to draw from.

---

## The Fix: Partition the Pool

A **bulkhead** is the discipline of dividing a shared resource into isolated compartments, so that exhausting one compartment cannot exhaust the others. Instead of one pool of 10 that everyone competes for, you carve it into dedicated sub-pools per workload:

```
BULKHEADED POOLS — each task type gets its own capped compartment

  ┌─────────────────────┐   ┌──────────────────┐   ┌──────────────────┐
  │ PRICING   (5 slots)  │   │ EMAIL  (3 slots) │   │ QUERIES (2 slots)│
  │ [##### saturated]    │   │ [#..  healthy]   │   │ [#.  healthy]    │
  │  ▲ slow API fills    │   │  ▲ unaffected —  │   │  ▲ unaffected —  │
  │    THESE 5, then     │   │    own slots     │   │    own slots     │
  │    fails fast /queues│   │                  │   │                  │
  └─────────────────────┘   └──────────────────┘   └──────────────────┘

  Pricing degrades → only pricing's 5 slots saturate.
  Email and queries keep their own slots and run untouched.
```

Now when pricing degrades, it saturates *its own* 5 slots. Additional pricing requests fail fast or queue **within that compartment** — which is exactly the behavior we want, because pricing genuinely is degraded. But the email compartment still has its 3 slots, the query compartment still has its 2, and both keep flowing at full speed. The blast radius of the pricing problem is contained to pricing.

The ship doesn't sink because the flooding is walled off in one compartment.

---

## A Worked Earnventory Scenario

Your afternoon batch runs a mix of work: 40 reorder decisions (each needs a pricing lookup), plus a steady trickle of low-stock alert emails and ad-hoc inventory queries from the dashboard.

At 2:00pm the supplier pricing API degrades to 30-second responses (not down — just slow).

```
WITHOUT BULKHEADS  (one shared pool of 10)
────────────────────────────────────────────────────────────
2:00  Pricing calls start holding slots for 30s each.
2:01  All 10 slots occupied by in-flight pricing lookups.
2:01+ EVERYTHING queues behind them:
        • low-stock alert emails — delayed 5+ min
        • dashboard inventory queries — time out, users see spinners
        • supplier notifications — delayed
      A pricing slowdown has become a TOTAL outage.
────────────────────────────────────────────────────────────

WITH BULKHEADS  (pricing:5  email:3  queries:2)
────────────────────────────────────────────────────────────
2:00  Pricing calls fill pricing's 5 slots.
2:01  Pricing compartment saturated → extra reorder decisions
      queue *within pricing's lane* (and its circuit breaker can
      now trip cleanly, because contention is visible & isolated).
2:01+ Email's 3 slots: UNTOUCHED. Low-stock alerts flow normally.
      Query's 2 slots: UNTOUCHED. Dashboard stays responsive.
      Impact = "reorders are slow this afternoon," not
               "the whole inventory agent is down."
────────────────────────────────────────────────────────────
```

Same degraded dependency. Without bulkheads it's a company-wide outage; with them it's a contained, honest, localized slowdown in exactly the one workflow that actually depends on the sick service.

Notice the bonus: bulkheads make your **circuit breaker work better too**. When pricing has its own compartment, its saturation and failures are cleanly attributable to pricing — so the breaker trips on the right signal instead of being confused by cross-contaminated shared-pool contention.

---

## What Counts as "the Resource" to Partition?

"Slots" is the intuitive example, but a bulkhead can partition any finite, shared resource an agent contends for:

- **Concurrency / worker slots** — the classic case above.
- **Token / rate budget** — if you have a 400K-tokens-per-minute API ceiling, give each subagent type a slice so a runaway summarizer can't consume the entire minute's budget and starve everything else.
- **Connection pools** — separate DB or HTTP connection pools per workload, so a subagent leaking or holding connections can't drain the shared pool.
- **Thread / memory budgets** — cap how much of each a single workload can hold.
- **Time / deadline budgets** — a per-compartment wall-clock cap on how long that lane may occupy resources before it's forced to yield.

The unifying question is always: *"What finite thing do all my workloads draw from — and what happens to the others if one workload consumes all of it?"* Wherever that answer is "everyone else starves," you have a bulkhead-shaped problem.

---

## The Central Tradeoff: Isolation Costs Utilization

Bulkheads are not free, and the cost is the same one that makes them work: **you give up flexible sharing.**

With one shared pool of 10, a burst of pricing work *could* legitimately use all 10 slots when nothing else needs them — maximum utilization. Partition into 5/3/2 and pricing is now capped at 5 even when the email and query lanes are sitting completely idle. You've traded some peak throughput for a guarantee that no single workload can starve the others.

```
THE TRADEOFF, IN ONE LINE

  Shared pool     → max utilization, zero isolation (noisy neighbor risk)
  Rigid bulkheads → max isolation, some wasted capacity (idle reserved slots)
```

That's the knob. Sizing each compartment is a judgment call driven by the same reasoning as every capacity decision:

- **Size by criticality, not just volume.** A low-volume-but-critical path (say, fraud/anomaly alerts) may deserve a reserved compartment precisely so it can *never* be starved by high-volume routine work — even if it usually sits idle.
- **Protect the cheap-and-important from the expensive-and-optional.** A 200ms email path should never be held hostage by a 30s pricing path. Separate lanes.
- **Watch for chronically-full compartments.** A lane that's always saturated is under-provisioned; a lane that's always empty is stealing capacity from the ones that need it. Bulkhead sizes are tunables to revisit with real traffic data, not set-and-forget.

Some mature systems soften the rigidity with **elastic bulkheads** — each compartment has a guaranteed reserved minimum but may borrow idle slots from others up to a hard cap, recovering some utilization while preserving a starvation floor. Powerful, but more complex; start rigid, earn the elasticity.

---

## How the Whole Resilience Stack Fits Together

Over the last three days we've assembled four small, composable mechanisms. Each answers a different question, and they stack into one resilient pipeline:

```
A call is about to go out
      │
      ▼
BULKHEAD:        which compartment's resources may this draw from?
                 (contain the blast radius BEFORE anything goes wrong)
      │
      ▼
CIRCUIT BREAKER: is this dependency currently down? → short-circuit if so
      │
      ▼
RETRY BUDGET:    the call failed — is it worth ONE more try?
      │
      ▼
FALLBACK:        we've given up on a fresh answer — what do we serve
                 instead? (cached value, safe default, escalate to human)
```

Read it as four scopes of protection, widest to narrowest:

- **Bulkhead** — protects *unrelated workloads* from each other (isolation, applied preemptively).
- **Circuit breaker** — protects *the system* from a sustained outage of one dependency.
- **Retry budget** — protects *a single call* from a transient blip.
- **Fallback** — keeps the system *useful* when all of the above have given up.

Bulkheads are the one that acts *before* trouble starts — the others react to failure; the bulkhead pre-commits to containing it. That's why it's structural: you can't bolt a bulkhead on mid-incident, the way you can bump a retry count. The compartments have to exist before the flood.

---

## The Analogy, Spelled Out

The word is borrowed straight from naval architecture, and the borrowing is exact. A ship's hull isn't one big open cavity — it's divided by transverse walls (bulkheads) into sealed compartments. If the hull is breached and one compartment floods, the bulkhead walls keep the water confined to that compartment. The ship rides lower, it's degraded — but it stays afloat, because the flooding can't spread. The *Titanic*'s tragedy was famously that its bulkheads didn't extend high enough: water sloshed over the tops from one compartment to the next, and the isolation failed.

A software bulkhead is the same instinct: seal off compartments so a flood — a slow dependency saturating its slots — stays confined to the workload that sprang the leak, instead of spreading to sink the whole system. And the *Titanic* lesson translates too: a bulkhead that's too shallow (a compartment sized so large it can still starve its neighbors, or a "shared overflow" that lets one lane spill into another) provides the illusion of isolation without the reality.

---

## The One-Sentence Takeaway

> A circuit breaker reacts *after* a dependency fails; a bulkhead acts *before* — it partitions your finite resources so that one slow or greedy workload can only ever drown its own compartment, never the whole ship.

---

## Free Resources

1. **Michael Nygard, *Release It!* — "Bulkheads" (stability pattern).** The book that named the pattern for software. Nygard's chapter on bulkheads and its companion patterns (circuit breaker, steady state, fail fast) is the canonical treatment; every concept here traces back to it. Summaries and excerpts: https://www.oreilly.com/library/view/release-it-2nd/9781680504552/

2. **Microsoft Azure Architecture Center — "Bulkhead pattern."** A crisp, diagram-driven engineering reference with concrete guidance on partitioning connection pools and concurrency, and explicit discussion of the isolation-vs-utilization tradeoff: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead

---

*Day 84 | Production Reliability thread | AI Agents Curriculum — Designed by Abeiku for Dad*
