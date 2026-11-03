AI Agents Day 77: Pipeline, Fan-out, and Swarm — Three Ways to Wire Agents Together

**Concept:** You have agents. Now: how do you connect them? Three patterns cover most real-world cases.

**Pipeline** — sequential handoff. A's output becomes B's input becomes C's input. Each agent does one thing. Works when steps are ordered and each depends on the last. A supplier invoice workflow: Extract → Analyze → Report. No step can run until the one before it finishes.

**Fan-out** — parallel dispatch. One orchestrator sends the same class of task to N agents simultaneously, waits, then synthesizes all results. Works when tasks are independent. Check all 20 Earnventory suppliers for price changes at once — not one at a time.

**Swarm** — dynamic routing. No fixed orchestrator. Agents hand work to each other based on what each can handle. Flexible, powerful, and genuinely hard to debug. Best for open-ended research tasks where the path isn't known in advance.

**Analogy:** Pipeline = assembly line. Fan-out = a task force deployed simultaneously. Swarm = a trading floor where deals route themselves.

Tomorrow: what actually travels in an agent handoff — and what stays behind by design.
