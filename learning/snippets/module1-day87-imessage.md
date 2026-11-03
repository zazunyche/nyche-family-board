**Day 87 — Timeouts & deadlines: putting a clock on every step so nothing waits forever**

Every pattern this week assumed you can *tell* when something's failing. That detection needs a clock. A **timeout** caps one call: "this pricing lookup gets 8 seconds, then give up." A **deadline** is different — an absolute end-time for the *whole* task, passed down every step. Timeout is per-hop and relative; deadline is end-to-end and shrinks as time gets spent.

The trap: nested timeouts that don't shrink. If the user's answer must land in 20s and step 1 burns 15s, step 2 can't still get its own fat 15s budget — it inherits the *5 seconds that remain*. Deadlines propagate; timeouts alone don't.

Earnventory: Zazu has 20s to answer "reorder SKU-4471?" Pricing eats 15s → margin analysis gets the 5s left, or is skipped for a cached estimate. Nobody waits forever; nothing burns tokens past the point the answer's useful.

**Analogy:** A timed exam. Three hours is the deadline — "pencils down" is non-negotiable. You also budget per question; blow 40 minutes on Q1 and you've stolen it from the rest.

Tomorrow: idempotency — making a retry safe so it never does the action twice.
