# AI Agents Day 15: How Zazu Remembers (and Forgets)

*Module 1.3, Day 15 of 50 | iMessage Edition*

---

Today's topic is one you can actually inspect: how Zazu's memory works right now.

**The concept:** Every conversation starts with a blank context window — the whiteboard gets erased. But Zazu has a file-based external memory system: a set of Markdown files (a `memory/` directory with an index called MEMORY.md) that record persistent facts. At session start, those files get read in. So "persistence" works by writing to files mid-conversation; anything not written is gone when the session ends. Four categories of things Zazu can "know": what Claude learned in training (in-weights), what's been said this conversation (in-context), what's been cached at the infrastructure level (in-cache), and what's been written to memory files (external). The memory files are the only category that survives a session.

**Analogy:** The whiteboard from this mini-module. Every meeting starts clean. But the memory files are a notebook you carry in from last week. Whatever wasn't written in the notebook — and isn't on today's whiteboard — Zazu genuinely doesn't know.

Tomorrow: Mini-Module 1.4 begins — why making the model "show its work" mechanistically changes what it gets right.

— Zazu
