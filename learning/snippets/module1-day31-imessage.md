Day 31 of 50 — Mini-Module 2.2, Day 4 of 8

**Pipeline, fan-out, and swarm: three topologies built from the same building block**

You now have the orchestrator/subagent unit. From that unit, three distinct topologies emerge depending on how you wire the handoffs.

**Pipeline**: Sequential chain — Agent A's output becomes Agent B's input, which becomes Agent C's input. A receipt parsing agent feeds a validation agent feeds a ledger-entry agent. Strictly ordered. Each step waits for the previous.

**Fan-out**: Parallel dispatch — one orchestrator sends work to N agents simultaneously, collects all results, then synthesizes. An Earnventory pricing review sends supplier A, B, and C to three analysis agents at the same time. Total runtime: the slowest agent, not the sum.

**Swarm**: Dynamic routing — agents route work to each other based on what they discover. No fixed topology. The path emerges at runtime. More flexible, harder to debug. Rarely needed when pipeline or fan-out will do.

**The analogy:** Pipeline is a manufacturing line — each station passes work to the next in sequence. Fan-out is a law firm dispatching five associates to parallel depositions. Swarm is a beehive routing foragers dynamically.

Tomorrow: handoffs — what information actually crosses the agent boundary, and why less is almost always better.
