AI Agents Day 78: Handoffs — What Travels, What Stays Behind

**Concept:** When one agent passes work to another, you face a design decision: what information does the receiving agent actually need? The naive answer is "everything — give it full context so it can't fail." The right answer is: the minimum needed to do the task and nothing more. This is the **minimum viable handoff** principle. The orchestrator composes a brief — task description, relevant inputs, output format, constraints — and that brief becomes the subagent's entire starting context. No conversation history. No unrelated state. No access to things it doesn't need.

**Example:** Zazu's scheduler checks for a meeting conflict. It doesn't hand the subagent your full conversation history, your inbox, or your household tasks. It passes one thing: "Does the user have any conflict between 2–3pm Tuesday?" The subagent answers that question and returns. Clean in, clean out.

Why minimal? Three reasons: token cost, security, and debuggability. A subagent holding irrelevant context costs more, surfaces more attack surface, and is harder to trace when it goes wrong.

**Analogy:** Mailing a package, not handing over the warehouse. The recipient gets what they need to act — not everything that exists.

Tomorrow: why trust between agents is architecturally harder than trust between services.
