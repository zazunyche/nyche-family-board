# AI Agents Day 86: Backpressure — Pushing "Slow Down" Upstream So Overload Never Builds

**Day 86 | Production Reliability thread | AI Agents Curriculum for Dad**

---

## Where We Left Off

Yesterday's topic — **load shedding** — is a *last-resort* defense. When demand has already exceeded capacity, you deliberately throw low-value work away so the capacity you have goes to what matters. It's the emergency brake: it works, but it's lossy. Something you accepted (or would have accepted) gets rejected.

That raises an obvious question. Shedding happens *once you're already overwhelmed*. Is there a way to stop the overload from building up in the first place — to keep the queue from ever growing to the point where shedding becomes necessary?

Yes. It's called **backpressure**, and it's the difference between *reacting* to a flood and *never letting the flood form*. Where shedding drops water at the door, backpressure reaches back up the pipe and turns down the tap.

---

## The Core Idea: A "Slow Down" Signal That Travels Backward

A pipeline is a chain of stages, each feeding the next:

```
   producer ──▶ stage A ──▶ stage B ──▶ stage C ──▶ done
   (source)     (fast)      (SLOW)      (fast)
```

Suppose stage B is the slow one — it can only handle 100 items/min, but the producer is happily generating 150/min. In a naive push system, the extra 50/min pile up in a queue in front of B, and (as we saw yesterday) that queue grows without bound until the whole thing collapses.

**Backpressure inverts the control.** Instead of the producer setting the pace, the *slowest consumer* sets the pace for everyone upstream of it. When B is full, it emits a signal — "I have no room, stop sending" — that propagates *backward* to A, and from A back to the producer. The producer pauses. When B drains an item and frees a slot, the signal reverses — "okay, send one more" — and flow resumes.

```
   producer ◀── "hold" ◀── A ◀── "I'm full" ◀── B (slow)
      │                                          ▲
      └── pauses until B signals room ───────────┘

   Result: the producer emits at ~100/min — B's true rate —
   NOT 150/min. The mismatch never accumulates.
```

The system self-regulates to the speed of its slowest stage. No unbounded queue can form, because the mechanism that *would* fill the queue (the producer) is the very thing being throttled.

---

## The Mechanism: Bounded Buffers Are the Whole Trick

The engineering primitive underneath backpressure is deceptively simple: **make every buffer bounded, and decide what happens when it's full.**

An *unbounded* queue is the root of the overload disease. It says "yes" to every arrival, absorbing the mismatch silently until memory or latency explodes. A *bounded* queue can't do that — it has a fixed number of slots, and when they're all taken, it must give the producer one of a few honest answers:

```
┌──────────────────┬──────────────────────────────────────────────┐
│ Full-buffer policy│ What the producer experiences                │
├──────────────────┼──────────────────────────────────────────────┤
│ BLOCK            │ producer waits until a slot frees (pull-style)│
│ REJECT / signal  │ producer gets "not now, retry later" (429)    │
│ DROP-newest      │ arrival is discarded (a shed — see Day 85)    │
│ DROP-oldest      │ stale item evicted to make room for fresh     │
└──────────────────┴──────────────────────────────────────────────┘
```

The first two are true backpressure — they push the "slow down" back to the source. The last two are really *shedding* dressed as a buffer policy. The distinction matters: backpressure preserves work by *delaying* it; shedding preserves the system by *discarding* it. A well-built pipeline uses backpressure as the primary regulator and shedding only when it genuinely cannot push back (more on that below).

---

## Push vs. Pull: Who Decides When Work Moves

The cleanest way to build backpressure in is to make the pipeline **pull-based** instead of **push-based.**

- **Push:** the producer sends work whenever *it* has work. The consumer is a passive victim of the producer's pace. Overload is the default failure mode.
- **Pull:** the consumer *requests* the next item only when *it* has capacity to handle it. The producer can't get ahead, because nothing moves until the consumer asks. Backpressure is the default — it's built into the control flow, not bolted on.

```
   PUSH (producer-driven):        PULL (consumer-driven):
   "here's work!" ──▶ [consumer]  [consumer] ──▶ "send me one"
        │                              ◀── one item
   floods if consumer is slow     never floods; consumer paces it
```

This is why pull-based designs are the reliability engineer's default. A message queue where workers *fetch* jobs when free (rather than a dispatcher shoving jobs at them) is naturally backpressured: if all workers are busy, nobody fetches, and jobs simply wait in durable storage instead of piling into an in-memory queue that can OOM.

---

## Backpressure in Agent Systems (Where This Bites You)

This is not abstract distributed-systems trivia — it shows up directly in how you run agents:

- **Token-per-minute and request-per-minute budgets.** The model API has finite throughput. If your orchestrator fans out 200 subagent calls at once, you don't get 200× speed — you get a wall of `429 Too Many Requests`. That 429, paired with a `Retry-After` header, **is the API applying backpressure to you.** The correct response is not to hammer harder; it's to slow your emission rate to match. (This is the server-side half of the retry-budget/backoff contract from Day 82.)

- **Bounded concurrency in fan-out.** Instead of launching every subagent simultaneously, cap in-flight calls at N and feed new ones only as slots free. This is backpressure you impose on *yourself* — a semaphore or worker pool that refuses to start job N+1 until job 1 finishes. It converts a spiky flood into a smooth stream at your sustainable rate.

- **Pull-based task intake.** An agent that *pulls* the next task from a queue when idle — rather than one that's handed tasks on a fixed timer regardless of whether it's still chewing on the last batch — cannot be overwhelmed by a bursty upstream. The queue depth becomes your load signal (a callback to yesterday's shedding triggers).

- **Streaming and context.** When an agent streams tokens into a downstream consumer (a UI, a parser, another agent), a slow consumer must be able to say "pause" — otherwise you buffer the entire stream in memory. Reactive-streams-style flow control exists precisely for this.

### The Earnventory picture

Your supplier-sync agent shouldn't pull invoices on a fixed 60-second timer that fires whether or not the *last* batch finished processing. Make it **pull-based**: it fetches the next batch of supplier updates only when a processing slot is free. Cap concurrent supplier API calls with a semaphore so a slow supplier endpoint can't make you open 500 simultaneous connections. And when a supplier's API returns a 429, treat it as gospel — back off by exactly what `Retry-After` says. During a Black Friday surge, this means your intake rate automatically tracks your true processing capacity: the flood we spent yesterday learning to *survive* mostly never forms, because the tap was turned down the moment the sink started to fill.

---

## Backpressure vs. Load Shedding: Two Halves of Overload Control

They are complementary, not competing. The clean mental model:

```
  ┌─────────────┬───────────────────────┬────────────────────────┐
  │ Mechanism   │ When it acts          │ What it does to work   │
  ├─────────────┼───────────────────────┼────────────────────────┤
  │ Backpressure│ BEFORE overload builds│ DELAYS it (slow source)│
  │             │ (preventive)          │ — work is preserved    │
  │ Load        │ AFTER capacity is     │ DISCARDS it (drop low- │
  │ shedding    │ already exceeded      │ value) — work is lost  │
  └─────────────┴───────────────────────┴────────────────────────┘
```

Backpressure is your first line: push back on the source and the overload never forms. But backpressure has a hard limit — **it only works when the source can actually be slowed.** You can throttle your own subagents. You can slow your queue consumers. You *cannot* tell real-world demand to wait: a Black Friday shopper won't "block" politely because your buffer is full. When the source is uncontrollable, backpressure has nowhere to push, and *that's* exactly when shedding takes over. Mature systems layer them: backpressure everywhere you control the flow, shedding at the outermost edge where you don't.

---

## The Failure Modes (Backpressure Has Sharp Edges Too)

- **Backpressure can propagate into deadlock.** If A is waiting on B, and B is (through some cycle) waiting on A, both block forever. Backpressure in a pipeline with feedback loops needs careful design — bounded buffers plus timeouts to break stalemates.

- **It can stall the *whole* line for one slow stage.** By design, the slowest stage paces everyone. If that stage is *pathologically* slow (not just naturally slow), backpressure means the entire upstream sits idle waiting on it. This is where it hands off to yesterday's tools: a **bulkhead** (Day 84) isolates that stage so it only stalls its own lane, and a **circuit breaker** (Day 83) cuts it out entirely if it's actually down.

- **Unbounded buffers defeat it silently.** Backpressure only exists if buffers are bounded. One accidentally-unbounded queue anywhere in the chain (a list you `append` to with no cap, an async channel with infinite capacity) becomes the pressure-relief hole where overload leaks in undetected. Audit for unbounded queues the way you'd audit for unclosed file handles.

- **"Bufferbloat": buffers set too large.** A giant buffer *technically* applies backpressure eventually — but only after it's absorbed so much work that latency is already terrible. Big buffers hide the problem and delay the signal. Counterintuitively, *smaller* buffers give faster, sharper feedback. Size buffers for smoothing brief bursts, not for hoarding.

---

## The Analogy, Spelled Out

Picture washing dishes with two other people: a **washer**, a **dryer**, and a **stacker** who puts dishes away.

The washer is fastest; the stacker is slowest because the cabinet is across the room. In a naive "push" world, the washer just keeps sliding clean-but-wet dishes down the counter as fast as she scrubs. They pile up in front of the dryer. The dryer can't keep up, so *his* dried pile grows in front of the stacker. Eventually dishes are stacked precariously three-deep across the whole counter — and one gets knocked to the floor. That's an unbounded queue and its inevitable crash.

Now add **backpressure**, which any real dish line does instinctively: the drying rack holds only six dishes (a *bounded* buffer). When it's full, the dryer stops taking wet dishes — so the washer's clean pile fills *her* small tray, and when *that's* full, she simply stops washing and waits. The "slow down" signal has traveled all the way back from the slow stacker to the fast washer. The line now runs at the stacker's pace — the slowest stage sets the tempo — and **nobody ever drops a plate.** No dish is thrown away (that would be shedding); each is merely *delayed* until there's room for it downstream.

The engineered versions are everywhere: **TCP flow control** (the receiver advertises a "window" telling the sender exactly how much it may send before waiting for acknowledgment), and **Toyota's kanban system** (a downstream station sends a card upstream authorizing production of exactly one more part — pull-based manufacturing, which is literally where "just-in-time" comes from). Both are the dish line, formalized: the consumer's readiness, not the producer's eagerness, governs the flow.

---

## The One-Sentence Takeaway

> Backpressure is the discipline of letting your slowest stage set the pace for everything upstream of it — by bounding every buffer and pushing a "slow down" signal back to the source — so that overload is *prevented* by delaying work rather than *survived* by discarding it.

---

## Free Resources

1. **Reactive Streams — the specification and its motivation.** The canonical modern treatment of backpressure as a first-class protocol between asynchronous producers and consumers, including the demand-signaling ("request(n)") model that makes pull-based flow control explicit. https://www.reactive-streams.org/

2. **"Backpressure explained — the resisted flow of data through software" (Jay Phelps).** An approachable, example-driven walkthrough of what backpressure actually is, why unbounded buffers are the enemy, and the buffer/drop/throttle strategies for handling a full pipeline. https://medium.com/@jayphelps/backpressure-explained-the-flow-of-data-through-software-2350b3e77ce7

---

*Day 86 | Production Reliability thread | AI Agents Curriculum — Designed by Abeiku for Dad*
