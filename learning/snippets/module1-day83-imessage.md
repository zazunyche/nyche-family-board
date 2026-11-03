**Day 83 — Circuit breakers: when to stop calling a failing subagent**

Yesterday: retry budgets cap a *single* call. Today: what if the same subagent keeps failing across *many* calls?

Retrying every time is worse than useless — you burn latency and tokens hammering something that's down, and every caller stalls on the same timeout. A **circuit breaker** watches the failure rate. After N failures in a row it "trips open": for a cooldown window, calls fail *instantly* without even trying. After the cooldown it goes "half-open" — lets one probe through. Succeeds? Close it, resume. Fails? Stay open, wait again.

Earnventory: your supplier-pricing subagent starts timing out at 2pm. Instead of 40 orders each stalling 30s on retries, the breaker trips after 5 failures — the next 35 return instantly with "pricing unavailable, using cached rate," and you probe once a minute until it recovers.

**Analogy:** The breaker panel in your house. It doesn't *retry* a short circuit — it cuts power fast so the wiring doesn't cook, and you flip it back on once, deliberately.

Tomorrow: bulkheads — isolating failures so one drowning subagent can't sink the whole ship.
