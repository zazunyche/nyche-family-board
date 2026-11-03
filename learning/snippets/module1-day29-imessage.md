Day 29 of 50 — Mini-Module 2.2, Day 2 of 8

**Orchestrator and subagent: the fundamental pattern**

Every multi-agent system has exactly two roles. The **orchestrator** holds the goal, writes the plan, and delegates. The **subagent** receives a bounded task, executes it with its own tools and reasoning, and returns a result. That's the whole pattern.

Concretely in an Earnventory weekly review: the orchestrator receives your request ("run supply chain review"), decomposes it, and sends each subagent a scoped task with only the context it needs. Subagent 1 gets: "here are last month's invoices from Supplier X — flag pricing anomalies." It runs, reasons, returns findings. It never knew about Supplier Y. That data never entered its context window.

This is the key architectural move: **isolated context windows**. Each subagent starts fresh. The orchestrator passes a targeted brief, not its full history. When the subagent finishes, its context is discarded. The orchestrator collects the output and stays lean.

**The analogy:** The orchestrator is the engagement manager at a consulting firm. Subagents are specialists. The manager doesn't hand each specialist the entire client file — just the relevant brief. Focus beats breadth.

Tomorrow: Zazu and Abeiku — the live case study.
