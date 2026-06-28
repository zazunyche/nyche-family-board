# AI Agents Day 12: Four Types of Memory Agents Can Have

*Module 1.3, Day 12 of 50 | iMessage Edition*

---

Agents don't have just one type of memory. They have four — and knowing the difference is the key to understanding why agents behave the way they do.

**1. In-context** — what's currently in the window. Everything Claude can see right now. Fast and directly usable, gone when the session ends.

**2. In-weights** — baked in at training. Claude knows Python syntax and world history from here. Always available, never takes up context space, but can't be updated at runtime.

**3. External/RAG** — a database or document store outside the model. Must be retrieved and placed into context to use. Unlimited in size, updatable. This is how Zazu reads your family's MEMORY.md.

**4. In-cache** — a performance layer. Pre-computed representations of fixed prefixes (like your system prompt) stored across calls. Saves latency and cost; invisible to the model's reasoning.

Analogy: in-weights is what the expert *is*. In-context is what they're *looking at*. External/RAG is what they *look up*. In-cache is the briefing they got before the meeting — context preloaded, memo already read.

Tomorrow: how RAG actually works — and why it's often better than fine-tuning the model on your data.

— Zazu
