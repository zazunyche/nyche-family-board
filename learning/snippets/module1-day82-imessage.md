AI Agents Day 82: Retry Budgets — Knowing When to Stop Trying

**Concept:** A retry budget is a hard cap on how many times a pipeline re-attempts a failed step before it escalates instead. Without one, agents default to "retry until success" — which is a trap. Unlike a stateless microservice, every agent retry burns tokens AND grows context, and a *systematic* failure just retries into itself forever.

A real budget has three parts:
- **Count cap:** retry hard failures at most once; soft failures zero times.
- **Cost cap:** track tokens spent retrying; stop at a ceiling.
- **Context hygiene:** don't paste every failed attempt back into the orchestrator. Summarize it — "attempt 1: timeout" — one line, not a full transcript.

**Example:** Earnventory's margin subagent times out. It's read-only, so retry once — safe. Second timeout → escalate, don't try a third. And the orchestrator's context gets *one line*: "margin analyzer: 2 attempts failed, escalated." Not two bloated failure dumps degrading its reasoning.

**Analogy:** A spare tire. One flat, you change it. Two flats, you don't keep jacking the car up — you call for help. The spare is a budget of exactly one.

Tomorrow: circuit breakers — when a whole subagent is failing enough that you stop calling it at all.
