**AI Agents — Day 92: Compaction**

A single conversation can outgrow your entire context window (Day 11). Then you face two bad options: drop the oldest turns and lose information, or stop dead. Compaction is the third way — summarize the old turns into a compact brief, then keep going with that brief standing in for the raw history.

Concrete: a long Claude Code session where you refactor 20 files. As the window fills, the agent compresses "what we changed and why, what's still open" into a few hundred tokens, drops the verbatim transcript, and continues — carrying the decisions forward without the full backlog.

Analogy: the meeting runs past what the whiteboard can hold. Instead of erasing in a panic, the secretary writes crisp minutes — decisions made, items still open — wipes the board, and copies the minutes back to the top. The meeting continues. The gist survives; the word-for-word chatter doesn't.

The art is what the summary keeps: goals, decisions, and open threads matter; throwaway detail doesn't. A bad summary quietly loses the one fact you needed.

Tomorrow: the KV cache — the fourth kind of memory, and why reusing a prompt prefix is almost free.
