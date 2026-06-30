# AI Agents Day 14: Context Engineering Is the New Prompt Engineering

*Module 1.3, Day 14 of 50 | iMessage Edition*

---

You've now met all four memory types and how RAG retrieves from the filing cabinet. Today's question: who decides what actually goes on the whiteboard, and when?

**The concept:** Prompt engineering was about wordsmithing a single instruction. Context engineering is bigger — it's the discipline of curating the *entire* assembled context for every model call: system prompt, retrieved documents, tool definitions, conversation history, prior tool results. As agents run longer (more tool calls, more turns), what you leave out matters as much as what you put in. Four core moves: **compress** (shrink without losing signal), **summarize** (replace raw history with distilled takeaways), **retrieve** (pull in only what's relevant, just-in-time), and **isolate** (hand a sub-task to a fresh context instead of polluting the main one). Skip this discipline and you get "context rot" — bloated, noisy windows where the model's attention gets spread thin and quality drops, even with room to spare.

**Analogy:** Prompt engineering is writing one good memo. Context engineering is running the whole meeting room — deciding what's on the whiteboard, what gets erased, what gets summarized onto a sticky note, and what stays in the filing cabinet until someone actually asks for it.

Tomorrow: how Zazu's own memory actually works — and what it deliberately forgets.

— Zazu
