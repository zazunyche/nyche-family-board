**Day 84 — Bulkheads: keep one drowning subagent from sinking the ship**

Yesterday: circuit breakers stop calling a dependency that's *down*. Today: what about one that's just *slow* — still answering, but hogging everything?

A slow subagent doesn't fail; it *holds*. If every task draws from one shared pool of worker slots (or one token/connection budget), a subagent stuck at 30s each will occupy every slot waiting on it — and unrelated tasks that need those slots just queue up and starve. One sick component, whole system stalled.

A **bulkhead** partitions the resource: give each subagent type its own capped pool. When the pricing subagent goes slow and saturates *its* 5 slots, the rest fail fast or queue — but email drafting, inventory lookups, and notifications keep their own slots and run untouched.

Earnventory: pricing degrades at 2pm, but reorder alerts and low-stock emails still flow, because they were never sharing pricing's slots.

**Analogy:** A ship's hull is divided into sealed compartments. One floods; the bulkhead walls keep the water in — the ship stays afloat.

Tomorrow: load shedding — choosing what work to drop when *everything's* overwhelmed.
