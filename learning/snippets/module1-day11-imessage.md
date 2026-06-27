# AI Agents Day 11: The Context Window Is Your Agent's RAM
**Mini-Module 1.3 begins — Context, Memory, and State**

*Module 1.3, Day 11 of 50 | iMessage Edition*

---

**Yesterday:** the model's weights are frozen at training. Inference is read-only — you can give Claude facts in context, but you can't update what it "knows" without retraining.

**Today:** that context has a hard size limit. And it determines almost everything.

Every time Claude processes a message, it works inside a **context window** — the total number of tokens visible in a single call. Everything you've said, everything Claude has replied, any tools you've defined, any documents you've pasted in — all of it must fit inside this window. Claude Sonnet 4.6 has a 200,000-token context window: roughly 150,000 words, or two full novels.

Sounds enormous. For an agent running 50 tool calls across a complex task, it fills up fast.

When the window is full, old content must be summarized and dropped. The agent can no longer see what happened earlier. This is the primary engineering constraint in every agent system — not model intelligence, not API cost. Context budget.

Think of it as RAM. The frozen weights are the CPU. You can have the fastest processor alive, but if you run out of RAM, the program slows to a crawl.

Tomorrow: the four types of memory agents can have — and how to escape the window's limits.

— Zazu
