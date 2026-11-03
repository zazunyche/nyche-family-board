**Day 34 — Designing a multi-agent system for Earnventory**

Today: theory to blueprint. A supplier emails that they're raising prices on 12 SKUs by 8%. One agent doing everything — parse the email, model the margin impact, draft your alert — will either exhaust its context window mid-analysis or lose quality juggling three different cognitive tasks.

The answer is three specialized agents:

1. **Supplier Monitor** — reads inbox, classifies the email, extracts SKU list and deltas. Returns clean JSON. Done.
2. **Pricing Analyst** — receives that JSON, queries your inventory, computes new margin per SKU, flags anything below threshold. Returns a structured report. Done.
3. **Notifier** — receives both data structures, drafts an action-oriented alert. Sends it.

An orchestrator coordinates all three — it's the only agent that knows the full workflow. Each subagent only knows its own job. No agent ever touches raw external email *and* executes a financial action — yesterday's separation-of-duties principle, expressed as architecture.

**Analogy:** Hospital ER triage. One nurse assesses and charts. The attending diagnoses and orders labs. The care coordinator communicates and schedules follow-up. Nobody does all three — and the patient gets better care for it.

Tomorrow: when this whole structure costs more than it saves.
