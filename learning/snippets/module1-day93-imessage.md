# AI Agents Day 93: When the Whiteboard Fills Up

*Module 1.3, Day 93 | iMessage Edition*

---

**The concept:** A context window is finite, but a long agentic task keeps piling messages, tool calls, and tool results into it. Eventually it nears the limit. Rather than crash, modern agents *compact*: they summarize the older part of the conversation into a compressed note, drop the raw turns, and keep going. You've seen this in Claude Code — a long session hits a point where it says it's "compacting," then continues with a summary standing in for the first hour of work. The risk: compaction is lossy. A detail that wasn't judged important enough to survive the summary is simply gone, the same way an un-filed fact is gone at session end.

**Analogy:** The whiteboard is full. Instead of erasing everything, you photograph it, jot a three-line summary in the corner, wipe the rest, and keep working from the summary. Faster — but the photo's caption is now all you have of what was erased.

Tomorrow: why *what you choose to keep* on that whiteboard is itself an engineering discipline.

— Zazu
