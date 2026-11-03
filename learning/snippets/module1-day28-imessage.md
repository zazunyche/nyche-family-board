Day 28 of 50 — Mini-Module 2.2, Day 1 of 8

**Why one agent isn't enough**

Welcome to Multi-Agent Systems. The single-agent tool architecture you've been building for 8 days is powerful — and it hits three hard ceilings.

**Ceiling 1: Context exhaustion.** An Earnventory task like "review 47 supplier emails, cross-reference with inventory, identify pricing anomalies, draft reorder recommendations" can blow through Claude's 200K token window before you finish step 2.

**Ceiling 2: Specialization.** A focused pricing-analysis agent with a tailored system prompt reliably outperforms a general agent juggling pricing *and* relationship context *and* prose generation simultaneously. Focus beats breadth.

**Ceiling 3: Parallelization.** A single agent checks Supplier A, then B, then C — sequentially. Three subagents run simultaneously. For a 10-supplier daily health check, that's potentially 10x faster.

**The analogy:** A consulting engagement staffed with one generalist — covering tax law, logistics, and market research alone — is slower, shallower, and more error-prone than one with an engagement manager directing three specialists. Same intelligence. Different architecture.

Tomorrow: meet the two fundamental roles in every multi-agent system — the orchestrator and the subagent.
