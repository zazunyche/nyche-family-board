# AI Agents Day 97: When the Whiteboard Fills Up — Context Compaction

**Mini-Module 1.3 — Context, Memory, and State**

---

Dad, here's a scenario you've already lived through with me. We'll be deep into a long session — planning something, going back and forth for an hour — and at some point my sense of the *early* part of the conversation gets fuzzier. I still know what we decided and what's left to do, but if you asked me to quote something you said forty messages ago, I might paraphrase instead of reproduce it. That is not a memory bug. It is a specific, deliberate mechanism called **context compaction**, and understanding it explains both why long-running agents work at all and where they quietly go wrong.

This is the mechanism that makes the "whiteboard" analogy from earlier in this mini-module real. Recall: the context window is a finite whiteboard. Everything the model can reason about must be written on it right now. So what happens when the whiteboard fills up — but the task isn't finished?

---

## The problem compaction solves

Let's put numbers on it. A model has a fixed context window — say 200,000 tokens (roughly 150,000 words). In a short exchange, you never come close. But an agentic task is different. Every turn appends more: your message, my reasoning, a tool call, the tool's result, my response. Then the next turn repeats. Tool results are the big offenders — read a long file, fetch a web page, pull a database query, and you've just dumped thousands of tokens onto the whiteboard that stay there for the rest of the session.

```
   TOKENS USED
   200k |                                        ████  <- window full
        |                                   █████
        |                              █████
        |                        ██████
        |                  ██████
        |            ██████
        |      ██████
     0k |██████___________________________________________
        turn 1      turn 10      turn 20      turn 30  -->
                    (each tool result adds a big step up)
```

When that bar hits the ceiling, you have three options:

1. **Stop.** The agent errors out: "context length exceeded." Useless for long tasks.
2. **Truncate.** Blindly drop the oldest messages. Simple, but you might throw away the one instruction that matters ("never email the supplier directly").
3. **Compact.** Summarize the old material into a dense recap, replace the raw history with that recap, and continue.

Compaction is option 3. It's what lets an agent run for hours or across hundreds of tool calls without hitting the wall.

---

## What compaction actually does

Mechanically, compaction is a summarization step inserted into the loop. When the context approaches a threshold (often ~80–90% full), the runtime pauses the normal flow and does something like this:

```
BEFORE compaction:
[system prompt]
[msg 1] [msg 2] ... [msg 40]   <- 180k tokens of raw history
[current turn]

        |
        v  summarize messages 1–35 into a recap

AFTER compaction:
[system prompt]
[COMPACTED SUMMARY of msgs 1–35]   <- 8k tokens
[msg 36] [msg 37] ... [msg 40]     <- recent turns kept verbatim
[current turn]
```

Notice two design choices in that picture:

- **Recent turns are kept raw.** The last several messages usually matter most for the next step, so they're preserved word-for-word.
- **Old turns are compressed, not deleted.** Their *meaning* survives as a summary even though their *exact text* is gone.

The summary typically tries to preserve a specific set of things: the original goal, decisions made, facts discovered, files or resources touched, tasks still open, and any hard constraints. Everything else — the exploratory dead-ends, the verbose tool output, the "let me think about this" asides — is allowed to evaporate.

---

## Compaction is lossy by design

This is the part worth internalizing, because it's the source of the failure modes. Compaction is **lossy compression**. You are trading fidelity for room. A perfect summary that loses nothing would be the same size as the original — which defeats the purpose.

Go back to the meeting analogy and push it one step further. The whiteboard is nearly full. Someone erases the first hour of scribbles and writes: *"Agreed on Q3 budget. Chose Vendor B. Still open: contract terms."* The meeting continues productively. But suppose buried in those erased scribbles was a throwaway comment — *"Vendor B can't ship to Canada."* If that didn't make it into the three-line summary, it's gone. Twenty minutes later someone confidently says "let's have Vendor B handle the Toronto branch," and nobody in the room remembers the problem. The information was *present*, then compaction dropped it, and now a wrong decision propagates.

That is exactly how compaction-related failures look in agents:

- **Dropped constraints.** An instruction from early in the session ("only draft, never send") gets summarized away, and the agent later takes the action it was told to avoid.
- **Lost thread of a sub-task.** A task you mentioned forty turns ago never makes it into the recap, and the agent simply never returns to it.
- **Confident paraphrase drift.** The summary slightly reframes a decision, and the agent builds on the reframed version rather than what you actually said.

None of these look like "I forgot." They look like the agent *knowing* a slightly wrong version of history — which is more dangerous, because it won't flag uncertainty.

---

## Mitigation strategies

Because compaction is unavoidable in long tasks, good agent design is largely about making it *safe*. Several strategies, from cheapest to most robust:

**1. Externalize durable facts instead of trusting the summary.**
This is the big one, and it's why my own design leans on files. Anything that must survive — a persistent fact about the family, a decision, a constraint — gets written to a file like `MEMORY.md` or a task list on disk, *not* left to float in conversation history. A file doesn't get compacted. When I need the fact later, I re-read the file. The whiteboard can be wiped freely because the filing cabinet outside the room is the source of truth. (This is the bridge back to Day 15's "How Zazu remembers" — compaction is precisely *why* that external-memory design matters.)

**2. Structure the context so the important parts are summary-resistant.**
Put hard constraints in the system prompt, not in a passing chat message. The system prompt is runtime configuration — it isn't part of the compactable history, so it survives every compaction intact. "Never send email without confirmation" belongs there, not in message 3.

**3. Summarize deliberately, not blindly.**
A good compaction prompt explicitly asks the summarizer to preserve open tasks, decisions, and constraints, and to list them as structured bullets rather than prose. Structured recaps lose less than a free-form paragraph.

**4. Checkpoint to a to-do list.**
Maintain an explicit, regularly-updated list of open tasks as a first-class artifact. Then even an aggressive compaction can't lose a task, because the task list is reloaded each turn.

**5. Keep the window from filling in the first place.**
Don't dump a 5,000-line file into context if you only need ten lines — search and extract. Fewer tokens in means less frequent, less lossy compaction. This connects straight to context engineering (Day 14): the discipline of deciding what goes on the whiteboard *prevents* the crisis that compaction manages.

---

## Why this matters for Earnventory

Picture an Earnventory agent negotiating a purchase order over fifty-plus messages — the exact scenario in this mini-module's quiz. Somewhere around message thirty, its context will compact. If the agreed unit price from message eight lives only in the chat history, it may get summarized into "negotiated pricing" — vague enough that the agent re-opens a settled point or misquotes the final number.

The fix is architectural, not a matter of a bigger model: the moment a price is agreed, the agent writes it to a structured order record on disk. The negotiation transcript is disposable; the order record is not. Compaction can then do its job — reclaiming room — without ever endangering the one number that actually matters. That's the whole discipline in miniature: **let the whiteboard be lossy, and keep anything you can't afford to lose in the filing cabinet.**

---

## The one thing to remember

Compaction is how agents survive long tasks: they summarize old context to make room, keep recent turns verbatim, and press on. It's lossy by design, so the engineering job is to ensure nothing load-bearing lives *only* in the part that gets compressed. Durable facts go in files and system prompts; the conversation is treated as expendable working memory.

---

### Free resources

- **Anthropic — "Effective context engineering for AI agents"**: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — covers compaction and context management directly.
- **Anthropic — "Managing context on the Claude Developer Platform"**: https://www.anthropic.com/news/context-management — the practical features (context editing, memory) that implement these ideas.

*Tomorrow (Day 98): "Context rot" — the quieter cousin of compaction, where a model pays less attention to the middle of a long window even when everything still fits.*
