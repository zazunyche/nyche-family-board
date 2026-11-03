**Day 86 — Backpressure: pushing "slow down" upstream so overload never builds**

Yesterday: load shedding *drops* work once you're already drowning. Today: how do you keep the flood from arriving in the first place?

**Backpressure** is a feedback signal that travels *backward* through a pipeline: when a downstream stage is full, it tells the stage feeding it to *stop sending* until there's room. Instead of a queue growing without bound, you use a *bounded* buffer — when it fills, the producer blocks (or gets a "not yet"). Overload can't accumulate, because the slowest stage sets the pace for everyone ahead of it. Shedding is the last resort *inside* your system; backpressure is flow control that prevents needing it.

Earnventory: your supplier-sync agent pulls invoices only when a worker slot frees up (pull-based), not on a fixed timer. A 429 + `Retry-After` from an API *is* backpressure — the server telling you to ease off. Honor it.

**Analogy:** A dish line — washer, dryer, stacker. If the stacker slows, the dryer's rack fills, so the dryer stops taking from the washer, so the washer stops. "Slow down" flows back up the line. Nobody drops a plate.

Tomorrow: timeouts & deadlines — putting a clock on every step so nothing waits forever.
