# AI Agents Day 87: Timeouts & Deadlines — Putting a Clock on Every Step So Nothing Waits Forever

**Day 87 | Production Reliability thread | AI Agents Curriculum for Dad**

---

## Where We Left Off

We've spent a week building a toolkit for surviving failure: **retry budgets** (Day 82) cap how hard you re-attempt, **circuit breakers** (Day 83) stop calling something that's down, **bulkheads** (Day 84) isolate a sick component, **load shedding** (Day 85) drops low-value work under overload, and **backpressure** (Day 86) prevents overload from forming.

Every one of those patterns quietly assumed something: that you can *tell when an operation has failed or is taking too long.* A circuit breaker trips after "N failures" — but what counts as a failure when a call simply never returns? A bulkhead frees a worker slot when a task "finishes" — but a hung task never finishes, so it never gives the slot back. Backpressure paces the pipeline to the slowest stage — but a *stuck* stage isn't slow, it's stopped, and it will stall the line forever.

The missing primitive underneath all of them is a **clock**. Timeouts and deadlines are how you convert "waiting forever" into "failing in bounded time" — and once a slow thing becomes a *fast, detectable failure*, every other pattern this week can finally act on it.

---

## Two Different Clocks: Timeout vs. Deadline

People use these words interchangeably. They are not the same thing, and confusing them is the source of most timeout bugs.

- **A timeout is per-operation and relative.** "This single call gets 8 seconds." It's a duration attached to one hop. Each call along the way can have its own.
- **A deadline is end-to-end and absolute.** "This entire request must be done by 12:00:20." It's a fixed point in wall-clock time attached to the *whole task*, and it's meant to be **propagated** — handed down to every sub-step, each of which must finish before the clock strikes.

```
   TIMEOUT (per hop, relative)          DEADLINE (end-to-end, absolute)
   ───────────────────────────         ───────────────────────────────
   call A: max 8s ─┐                    task must finish BY t=20s
   call B: max 8s ─┼─ each independent   │
   call C: max 4s ─┘                     └─ every step shares ONE shrinking
                                            budget: remaining = 20s − elapsed
```

The critical difference: **timeouts don't know about each other; a deadline does.** If you only use per-hop timeouts, three steps that each "get 8 seconds" can legitimately take 24 seconds total — even though your user stopped caring after 20. A deadline fixes this by shrinking: step 2 doesn't get a fresh 8 seconds, it gets *whatever is left* of the shared budget after step 1.

---

## Deadline Propagation: The Budget Must Shrink Down the Call Tree

This is the single most important idea in the whole topic, and the one most systems get wrong.

Imagine Zazu answers "should I reorder SKU-4471?" and you've decided a useful answer must land within **20 seconds** (past that, you'd rather have a fast approximate answer than a slow perfect one). That 20s is the deadline. Now Zazu fans out to sub-steps:

```
  t=0    Deadline set: finish by t=20s   (remaining: 20s)
   │
   ├─▶ supplier-pricing lookup ......... takes 15s   (remaining now: 5s)
   │
   ├─▶ margin analysis ................. budget handed down = 5s, NOT 8s
   │                                     (it inherits what's LEFT)
   │
   └─▶ draft recommendation ............ if the clock's already blown,
                                         skip live work, use cached estimate
```

The margin step must be *told* "you have 5 seconds," not handed its own optimistic default. That's deadline propagation: each layer computes `remaining = deadline − now` and passes it down. A sub-step that can't possibly finish in the time left shouldn't even start — it should fail fast, or fall back to a cached/approximate result.

**The classic bug is the opposite: nested timeouts that stay constant (or grow) as you descend.** If the outer request has a 15s timeout but an inner call has its *own* 30s timeout, the outer gives up while the inner is still grinding away — and now you have **orphaned work**: an abandoned call still burning CPU, tokens, and a connection slot for a result nobody will ever read. The rule of thumb:

> **Inner timeouts must be strictly *smaller* than the outer deadline — and must account for retries.** A call with a 10s timeout that you retry 3× needs ~30s of outer budget, not 10s.

---

## Why Agents Need This More Than Ordinary Software

Agent systems have two properties that make missing clocks especially dangerous:

**1. LLM calls are slow and heavy-tailed.** A model call isn't a 5ms database read; it's seconds, and the p99 is far worse than the median. A subagent doing three tool calls plus reasoning can legitimately take 30+ seconds, and *occasionally* stall much longer. Without a timeout, one unlucky call holds a bulkhead slot hostage.

**2. The agentic loop can run forever.** This is unique to agents. A normal function returns. An agent *loops* — reason, act, observe, reason again — and nothing structurally forces it to stop. A subagent that keeps deciding "one more tool call should do it" can burn your entire token budget chasing a goal it will never reach. So agents need **two** clocks, not one:

```
  ┌───────────────────┬────────────────────────────────────────────┐
  │ Clock             │ Bounds…                                     │
  ├───────────────────┼────────────────────────────────────────────┤
  │ Wall-clock timeout│ how LONG a step may run (seconds)           │
  │ Step / iteration  │ how MANY loop turns before forced stop       │
  │   budget          │ (e.g. "max 10 tool calls, then finalize")   │
  │ Token budget      │ a deadline denominated in COST, not time    │
  └───────────────────┴────────────────────────────────────────────┘
```

A wall-clock timeout alone won't save you from a fast infinite loop that spins cheaply-but-endlessly; a step cap won't save you from one call that hangs on a dead socket. You want both, plus a token ceiling as the ultimate backstop — the token budget *is* a deadline, just measured in dollars instead of seconds.

### The Earnventory picture

Zazu gets "reorder SKU-4471?" with a 20-second answer deadline. It propagates that budget: the supplier-pricing subagent is launched with `remaining=20s`; when it returns at t=15s, the margin subagent is launched with `remaining=5s` — and *told* so. If pricing had instead hung, its 8-second timeout fires at t=8s, the call is cancelled (not abandoned — actually cancelled, so it stops consuming tokens), the circuit breaker records a failure, and Zazu falls back to yesterday's cached rate. Meanwhile every subagent carries a **max-10-tool-call** cap so a confused one can't loop until your monthly token bill notices. The user gets an answer — possibly a slightly degraded one — inside the window where it's still actionable, every single time.

---

## Setting the Numbers: The Tuning Trap

A timeout value is a real engineering decision, and both directions hurt:

- **Too tight** → you kill *healthy* calls that were just having a slow-but-normal day. Those become false failures, which trigger retries, which add load, which makes everything slower, which trips *more* timeouts. This feedback loop — "timeout amplification" — can take down a system that was merely busy, not broken.
- **Too loose** → hung calls hold resources for ages before you notice, starving the slots and budgets the whole week's patterns depend on.

The right way to pick: **base timeouts on your observed latency distribution, not a guess.** Set the timeout somewhere above your p99 (so normal slow calls survive) but well below the point where a held resource does damage. And *never* set it to the average — half your legitimate traffic is slower than average, and you'd murder all of it.

---

## The Failure Modes (Clocks Have Sharp Edges Too)

- **Orphaned / abandoned work.** Firing a timeout on the *caller* side without actually **cancelling** the downstream operation means the work keeps running invisibly — burning tokens for a result that will be discarded. A timeout must trigger real cancellation, not just "stop waiting."

- **Retry × timeout multiplication.** As above: if the layer above you budgeted less time than `timeout × retries` of the layer below, the upper layer bails mid-retry. Every level of the stack must know the levels below it, or the math doesn't close.

- **Timeouts that don't cover the whole operation.** A 5-second connect timeout with no *read* timeout still hangs forever if the connection opens but no data ever arrives. Put a clock on the *entire* operation, not just its first phase.

- **Non-propagated deadlines.** The most common real-world version: each service has a sensible local timeout, but nobody passes the *remaining* budget down, so the deadline is never actually enforced end-to-end. Work continues at layer 4 long after the user at layer 0 gave up.

- **Retrying a non-idempotent action after a timeout.** This is the nastiest one — and it's exactly where we go tomorrow. If `send_purchase_order` times out, did it fail… or did it succeed and just fail to *tell* you in time? Retry blindly and you may have ordered twice.

---

## The Analogy, Spelled Out

Think of a **timed exam.**

The whole exam has a hard **deadline**: three hours, and when the invigilator calls "pencils down," it is absolute and non-negotiable — no amount of "but I was almost finished" buys you another minute. That's your end-to-end deadline: a fixed point in wall-clock time that the entire task must complete before.

Within those three hours, a smart student *budgets per question* — "roughly 30 minutes each, six questions." Those per-question budgets are **timeouts**: local, relative caps on each step. And here's the propagation lesson made physical: if you blow **40 minutes** on Question 1, you have not simply "used more time" — you have *stolen* it from the questions still ahead. Your remaining budget shrank, and Question 6 now inherits whatever's left, not a fresh 30 minutes. The wise move when you're over budget on a hard question is to **cut your losses and move on** — a fast, partial answer to every question beats a perfect answer to two and blanks on the rest. That's exactly a subagent falling back to a cached estimate because the clock ran short.

The engineered versions are everywhere: **gRPC deadlines** are absolute timestamps that propagate automatically across every service hop in a call chain (each service sees "how much time is left" and shrinks it further downstream); **Go's `context.Context`** threads a cancellable deadline through every function in a request so that when the clock expires, *everything* downstream is signalled to stop at once. Both are the exam clock, formalized: one shared "pencils down" moment that every part of the work is accountable to.

---

## The One-Sentence Takeaway

> A **timeout** is a relative cap on one operation; a **deadline** is an absolute, *propagated* end-time for the whole task — and agent systems need both, plus a step/token budget, so that "waiting forever" always becomes a fast, detectable, cancellable failure that the rest of your reliability toolkit can act on.

---

## Free Resources

1. **"Deadline Propagation" — Google SRE Book, *Addressing Cascading Failures*.** The canonical explanation of why per-hop timeouts aren't enough and how an absolute deadline must be threaded down a call tree, shrinking at each layer. https://sre.google/sre-book/addressing-cascading-failures/

2. **"gRPC and Deadlines" — the official gRPC blog.** A concrete, code-level walkthrough of deadlines vs. timeouts, why deadlines should be absolute and propagated, and the failure modes of getting them wrong (including orphaned work). https://grpc.io/blog/deadlines/

---

*Day 87 | Production Reliability thread | AI Agents Curriculum — Designed by Abeiku for Dad*
