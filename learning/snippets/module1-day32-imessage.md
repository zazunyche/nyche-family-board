**Day 32 — Handoffs: What Transfers and What Doesn't**

When Zazu delegates to Abeiku, it doesn't dump its entire context. It sends a scoped brief: the specific task, the relevant facts, the tools needed. Abeiku starts fresh — no family history, no prior conversation, no knowledge of *why* it was called. This is intentional.

Full context transfer is expensive (tokens cost money), risky (more exposure than needed), and often counterproductive (irrelevant details confuse the model). The design principle is called **minimum viable handoff**: pass only what the subagent needs to succeed at its specific task.

At the API level, a handoff is literally just a new `messages` array the orchestrator constructs manually. It decides what goes in.

What transfers:
- The specific task instruction
- Relevant context (the invoice data, the supplier name)
- Tool definitions scoped to this task
- Output format requirements

What doesn't:
- The orchestrator's full conversation history
- Other subagents' internal reasoning
- User data irrelevant to this task

**Analogy:** Briefing a contractor. You give them scope of work and access to what they need. You don't hand them your tax returns.

Tomorrow: why agents shouldn't automatically trust each other — even within the same system.
