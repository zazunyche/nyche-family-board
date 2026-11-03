**Day 35 of 50 — When NOT to Use Multi-Agent**

We've spent the week building the case for multi-agent systems. Today: the counterargument.

Multi-agent adds real costs that compound in production:

**Latency:** Every agent hop is a full model round-trip — 1–5 seconds each. A three-agent pipeline can hit 10+ seconds before a user gets a response.

**Error propagation:** Agent A makes a factual mistake → Agent B reasons perfectly from a wrong premise → you get a confident, coherent, wrong answer with no visible error signal.

**Context overhead:** Three agents = three system prompts, three tool definition sets, three places to get context engineering wrong.

**The Earnventory test:** If one agent with four tools can query invoices, compute margin, and draft an email in a single pass — adding two more agents just buys you latency, debugging complexity, and failure points. Not specialization. Not scale. Just overhead.

**The rule:** reach for multi-agent when tasks are *genuinely* parallel, *actually* too large for one context, or *truly* require different specializations. Otherwise, one agent with more tools wins.

Analogy: A 3-person committee to write one paragraph. Coordination cost exceeds the task.

Tomorrow: the Mini-Module 2.2 quiz — five questions on everything from orchestrators to trust chains.
