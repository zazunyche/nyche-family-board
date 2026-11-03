AI Agents Day 51: When the Whiteboard Fills Up

**Concept:** Every agent has a finite context window — and agents like Zazu run long sessions. When the context fills up, the system *compacts*: it summarizes or discards the oldest content to make room. This is called context compaction, and it's one of the most consequential invisible operations in any production agent system.

**Example:** Claude Code (Zazu's runtime) handles this automatically. When your conversation history approaches the limit, it generates a condensed summary — "Discussed grocery planning, updated three calendar events, flagged a school appointment" — replacing hundreds of raw turns with a single compact block. The next turn starts with a clean slate anchored to that summary.

**Analogy:** The meeting-room whiteboard again. Compaction is the mid-session janitor who photographs the board, erases it, and writes a one-paragraph summary in the corner. The detailed math is gone. The decision survived. But if you wrote a specific constraint in the upper-right corner and it didn't make it into the summary — it's gone.

Tomorrow: Mini-Module 1.3 quiz — five questions connecting context, memory, and RAG to Earnventory.
