# AI Agents Day 51: Context Compaction — When the Whiteboard Runs Out of Space

---

## The Problem Nobody Plans For

You've spent the last several weeks learning about the context window as your agent's RAM — finite, expensive, and the primary engineering constraint in agent system design. But there's a gap in that framing: RAM in a real computer can be managed dynamically. It can be swapped to disk. It can be freed when no longer needed. The context window, in its naive form, can only grow.

An agent that runs a 10-turn conversation uses more context than one that runs 3 turns. An agent that calls tools appends tool results to context. An agent that reasons extensively produces reasoning traces — also in context. Left unchecked, every long-running session will eventually hit the limit. And then what?

This is the **compaction problem**, and it's one of the most consequential invisible operations in any production agent system. Today we go deep on what compaction is, how it works, what it sacrifices, and how to design around it — with Zazu and Earnventory as the concrete anchors throughout.

---

## What Compaction Actually Is

Context compaction is the process of reducing the size of the context window by summarizing, discarding, or restructuring its contents — while preserving enough information for the agent to continue functioning.

The goal is not to "remember everything." That becomes impossible once you've hit the limit. The goal is to **preserve decision-relevant information** while shedding detail that no longer matters. This is a **lossy operation** — you will always lose something. The engineering challenge is controlling *what* you lose and ensuring what survives is the right subset.

Three broad strategies exist in production systems today.

---

## Strategy 1: Sliding Window

Keep only the most recent N tokens. Everything older is dropped.

```
FULL HISTORY (too large):
[t1][t2][t3][t4][t5][t6]...[t44][t45][t46][t47][t48][t49][t50]

AFTER SLIDING WINDOW (keep last 20 turns):
                              [t31]...[t45][t46][t47][t48][t49][t50]
                              |_____________WINDOW_________________|
```

**Advantage:** Simple. Zero additional processing cost. Perfectly predictable behavior.

**Disadvantage:** The agent completely forgets everything outside the window. If you established a critical constraint in turn 2 — "only reorder from suppliers with net-90 payment terms" — it's gone by turn 40. The agent may contradict earlier decisions or re-ask questions it already answered hours ago.

Sliding window works well for stateless, short-horizon tasks where early turns genuinely don't matter — like processing a stream of independent documents. It fails badly for stateful, extended workflows like supplier negotiations or multi-day planning sessions.

---

## Strategy 2: Summarization

Replace older turns with an LLM-generated summary of what happened. Raw turns are removed; the summary stays.

```
BEFORE COMPACTION:
[t1: user asks about inventory status]
[t2: agent returns full SKU list — 800 tokens]
[t3: user: "filter for below-threshold items"]
[t4: agent identifies 12 at-risk SKUs]
[t5: user: "draft reorder emails for those 12"]
[t6-t20: drafting, editing, approving emails]
... [t21-t50: new topics]

AFTER COMPACTION:
[SUMMARY: Reviewed inventory; identified 12 below-threshold SKUs (Osei, Baako, 10 others);
drafted and user-approved reorder emails for all 12. User then moved to pricing review...]
[t31][t32]...[t50]
```

**Advantage:** Preserves the gist. The agent can continue with semantic continuity — it "knows" the emails were sent, the SKUs were identified — even though the verbatim transcript is gone.

**Disadvantage:** Precision loss. The summary says "12 below-threshold SKUs" but may not name all of them. If you need to reference the specific threshold value mentioned in turn 4, it may be gone. Summarization also costs additional tokens at generation time, since you're running an LLM call to produce the summary.

This is the strategy **Claude Code uses for Zazu**. When your session approaches the context limit, Claude Code's harness generates a compact summary of the conversation so far, replaces the raw history with it, and continues. From your perspective the session never interrupts — but internally, Zazu's "memory" of the early conversation is now a summary.

---

## Strategy 3: Selective Pruning

Instead of uniformly summarizing everything old, identify and retain high-value content while discarding low-value content.

```
FULL HISTORY (mixed value):
[tool_result: 1,200 tokens of raw invoice JSON — already processed]
[user: "ok thanks"]
[system constraint: "never approve POs over $50K without confirmation"]
[tool_result: 890 tokens of supplier catalog data — already used]
[key decision: "Osei account gets net-90 regardless of threshold"]
[tool_result: 640 tokens of exchange rate data — already used]

AFTER SELECTIVE PRUNING:
[system constraint: "never approve POs over $50K without confirmation"]
[key decision: "Osei account gets net-90 regardless of threshold"]
[last 10 turns of active conversation]
```

**Advantage:** Retains the most decision-critical content. Large tool results that were processed and acted on don't need to occupy space forever. Explicit user constraints and decisions are flagged as high-priority and kept.

**Disadvantage:** Requires heuristics — or another LLM call — to classify what's "important." More complex to implement correctly. Can accidentally discard something you didn't realize you'd need later.

Selective pruning is common in production systems where engineers have domain knowledge about what's safe to drop. For Earnventory: raw invoice JSON can always be re-fetched from the database, so it's safe to prune. A user's stated preference about a supplier relationship is not safe to prune.

---

## What Claude Code Does: The Zazu Reality

Claude Code uses summarization-based compaction. The sequence when a session runs long:

```
SESSION LIFECYCLE:

[Start]   System prompt + empty history
          ← turns accumulate: user msgs, tool calls, tool results →

[~80% full]  COMPACTION EVENT:
          1. Harness detects context approaching threshold
          2. Calls Claude API: "Summarize this conversation so far"
          3. Generates compact summary block (~500-800 tokens)
          4. Replaces full raw history with summary
          5. Session continues

          ← turns accumulate again →

[~80% full again]  SECOND COMPACTION EVENT:
          Summary + new turns → new (more compressed) summary
          Session continues
```

Each compaction event compresses further. By hour 3 of a long session, Zazu is working from a summary of a summary — still functional, but progressively less precise about specific details from early in the conversation.

This is not a flaw. It's an intentional design tradeoff: **keep the agent running** at the cost of **precision on distant history**. For the vast majority of tasks, this is the right call. You'd rather have an agent that continues working — even with slightly blurry memory of two hours ago — than one that crashes when it hits the limit.

---

## What Gets Lost — And Why It Matters for Earnventory

The practical risk of compaction is **constraint erosion**: specific rules or preferences you stated early in a session may not survive verbatim into the summary.

Imagine you told Zazu at the start of a long session: "Never approve a purchase order over $50,000 without calling me first." That's a specific constraint. A good summarization preserves it. A compressed summary of a summary might reduce it to "user has approval preferences" — losing the threshold entirely. Later in the session, Zazu might flag a $52K PO as fine, not because it forgot the constraint category, but because the precise number didn't survive the compression.

Three things are especially at risk during compaction:

1. **Specific numbers and thresholds** — "$50K limit," "net-90 terms," "12% minimum margin" can become vague references to "financial constraints"
2. **Explicit named exceptions** — "except the Osei account" may not survive into a tight summary
3. **Implicit decisions made through feedback** — if you corrected the agent's approach once and it adapted, that adaptation may not be summarized explicitly

The mitigation principle is clear: **externalize durable constraints**. Anything that matters to Earnventory's operation doesn't belong in in-context history — it belongs in:
- The **system prompt** (if static and always relevant)
- A **retrieval store** (if it varies by supplier or SKU and needs to be fetched on demand)
- A **database write** (if it's a decision that was just made and must persist)

Never rely on "I mentioned it three hours ago" for anything load-bearing.

---

## Designing for Compaction: Four Practical Patterns

**Pattern 1: Checkpoint writes after decisions.** After every consequential decision, write it to external storage immediately. Don't trust in-context history. If the agent approves a PO, that approval hits the database before the next turn. Compaction can't erase a committed database write.

**Pattern 2: Inject key state at session start.** When a long workflow resumes — next morning, new session — re-inject the critical state at the top: open POs, active constraints, pending decisions. Treat every session start as if the previous session's memory is unreliable.

**Pattern 3: Prefer short, focused sessions.** An agent doing one specific task in a bounded session is far less exposed to compaction than an agent trying to manage everything in one marathon session. Do the grocery planning in one session. Do the supplier pricing review in a separate session. Less compaction risk, cleaner reasoning.

**Pattern 4: Verify before acting on old state.** If your agent is about to take an irreversible action based on something said hours ago, verify first. Call a tool to re-fetch the current state rather than trusting a potentially-summarized version of what was true at turn 5.

---

## The Broader Point: In-Context Memory Is Not Reliable Storage

Compaction makes explicit something that's easy to miss when context windows feel large: **in-context memory degrades under pressure**. It is a working scratchpad, not an archive.

This is why the four-memory-type framework from Day 12 has real operational consequences:

```
Memory Type     | Survives Compaction? | Notes
----------------|---------------------|------------------------------------------
In-context      | No (degrades)       | Lives in the thing being compacted
External / RAG  | Yes                 | Stored outside the context window
In-weights      | Yes                 | Trained into the model at build time
KV cache        | Partially           | Resets between sessions; helps within one
```

For production Earnventory workflows, anything that must persist reliably belongs in the column that survives compaction — external storage and retrieval, or the system prompt. The context window is for *reasoning*. External storage is for *remembering*.

The whiteboard analogy from Day 11 turns out to be more precise than it first appeared: the whiteboard **will** get erased mid-meeting. Design your system so that the decision-critical facts live in the filing cabinet before that happens.

---

## Resources

- Anthropic's Claude Code memory and compaction behavior: https://docs.anthropic.com/en/docs/claude-code/memory
- "Managing Long Contexts in LLM Applications" (Pinecone practical guide): https://www.pinecone.io/learn/long-context/

---

*AI Agents curriculum — Designed by Abeiku for the Nyche family. Day 51 of 50, Mini-Module 1.3 bonus: Context, Memory, and State.*
