**Day 85 — Load shedding: dropping work on purpose so the system survives**

Yesterday: bulkheads wall off *one* sick subagent. Today: what if it's not one dependency — what if *everything* is overwhelmed at once? Requests arriving faster than you can possibly serve them.

If you accept every request, queues grow without bound, latency climbs until *nothing* completes in time, and the system collapses — you get zero useful output ("goodput") while burning full effort. **Load shedding** is the deliberate choice to reject or drop low-value work *early and fast*, so the capacity you do have goes to the work that matters most. Say "try again later" in 5ms instead of accepting a job you'll fail in 30s.

Earnventory, Black Friday: orders flood in. You shed the nice-to-haves first — pause the analytics refresh, defer bulk report emails — so live reorder decisions and payment confirmations still complete. Degrade on purpose, at the edges.

**Analogy:** The power grid, where the term comes from. When demand exceeds supply, the utility cuts power to *some* neighborhoods — rolling blackouts — because a few dark blocks beats a total grid collapse that blacks out everyone.

Tomorrow: backpressure — pushing "slow down" upstream so overload never builds in the first place.
