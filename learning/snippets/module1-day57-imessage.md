AI Agents Day 57: Memory and Planning — A Unified Picture

**Concept:** Your agent can only plan using what's in context right now. But what's in context comes from four completely different sources — training (in-weights), session-start loading (external memory), turn-by-turn conversation (in-context), and computation cache (KV cache). Planning draws on all four simultaneously. The plan is only as good as the union of those sources, and a gap in any one produces a gap in what the agent can reason about.

**Example:** When Zazu plans your morning briefing, it draws on: family names and preferences loaded from MEMORY.md at session start (external), today's date from the system prompt (in-context), what you asked in the last turn (in-context turn-by-turn), and general knowledge of Gmail and Calendar from training (in-weights). Remove MEMORY.md and Zazu doesn't know it's planning for *your* family. Remove the conversation history and Zazu doesn't know what you've already seen. Each memory type contributes something no other can replace.

**Analogy:** A conductor draws on years of training, the score placed on the stand before curtain, hand signals from musicians mid-performance, and muscle memory for passages rehearsed a hundred times. All four streams merge to produce one coherent performance. Cut any one and the music changes — sometimes subtly, sometimes catastrophically.

Tomorrow: wrapping up — what you now know about agents that most developers don't.
