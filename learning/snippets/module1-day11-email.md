# AI Agents Day 11: The Context Window Is Your Agent's RAM
**Why the Primary Engineering Constraint Isn't Intelligence — It's Budget**

*Module 1.3, Day 11 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 22, 2026*

---

## The Short Version

Every call to Claude happens inside a **context window** — the total number of tokens that can be present in a single API call. Input (your messages, system prompt, tool definitions, retrieved documents) plus output (Claude's response) must all fit inside this window.

Claude Sonnet 4.6 has a 200,000-token context window — roughly 150,000 words. That sounds enormous until you build a system that makes 50 tool calls, retrieves documents from a database on each call, and maintains a long conversation history. It fills up.

When it does, you have a problem. And how you solve that problem is one of the most important architectural decisions in any agent system.

---

## What the Context Window Actually Is

The context window is not a feature — it's a fundamental constraint of how transformer models work.

Transformer models process tokens by attending to every other token in the sequence. The "attention" mechanism lets each token look at and weight every other token when computing its representation. This is what enables coherence, long-range reasoning, and the ability to answer questions about something mentioned 10,000 tokens earlier.

But this mechanism scales quadratically with sequence length. Double the context window: 4x the computation. The 200,000-token context in Claude Sonnet 4.6 is a significant engineering achievement — it required substantial architectural work and is not "free" in compute terms.

The limit exists at the hardware and architecture level. It isn't a product decision you can negotiate away.

```
WHAT LIVES IN THE CONTEXT WINDOW
═══════════════════════════════════════════════════════════════
┌──────────────────────────────────────────────────────────┐
│  CONTEXT WINDOW (200,000 tokens max in Sonnet 4.6)      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ System prompt                          ~2,000 tok  │  │
│  │ Tool definitions (each one costs)     ~500–2k tok  │  │
│  │ Conversation history (grows each turn)          ↕  │  │
│  │   Turn 1: User + Assistant            ~200   tok  │  │
│  │   Turn 2: User + Tool results + Asst  ~1,500 tok  │  │
│  │   Turn 3: User + Tool results + Asst  ~1,500 tok  │  │
│  │   ...                                            ↕  │  │
│  │ Retrieved documents (if using RAG)    variable    │  │
│  │ Current user message                  variable    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Output (Claude's response) also costs tokens            │
│  Max output: 8,192 tokens in Sonnet 4.6                  │
└──────────────────────────────────────────────────────────┘
```

Every piece of information Claude can "see" in a given call must be somewhere in this window. If it's not in the window, the model literally cannot access it — not because it forgot, but because there are no tokens representing it in the current input sequence.

---

## The RAM Analogy

The context window is your agent's **working RAM**.

The frozen model weights (everything the model learned during training) are analogous to the **CPU** — the computation engine, always available, constant. But working memory — what the CPU is currently operating on — is the context window.

When a human expert works on a complex problem, they can hold a limited amount of information in working memory at once. They compensate by writing things down, making notes, summarizing, and referring back to external records. Expert agents do the same.

```
ANALOGY: WHITEBOARD IN A MEETING ROOM
═══════════════════════════════════════════════════════════════

Context Window = the whiteboard in the room
                 • Limited space
                 • Everything visible to everyone in the room
                 • Erased when the meeting ends

Model Weights =  the expertise in participants' heads
                 • Not limited by the whiteboard
                 • Brought in from training
                 • Available every meeting

External Memory = the filing cabinet in the hallway
                  • Holds far more than the whiteboard
                  • Must be retrieved to use it
                  • Persists across meetings

═══════════════════════════════════════════════════════════════
When the whiteboard is full, you don't get smarter participants.
You get a smaller working space until you erase something.
```

This analogy will anchor the next four days of mini-module 1.3. Different memory types in agent systems are essentially different strategies for managing what gets on the whiteboard, what stays in the filing cabinet, and how to retrieve things quickly when you need them.

---

## Concrete Token Math

Token budgets become viscerally real when you build something non-trivial. Here's an example:

**Scenario:** An Earnventory agent that monitors your top 50 suppliers for pricing anomalies.

```
TOKEN BUDGET ESTIMATE — Earnventory Supplier Monitor
═══════════════════════════════════════════════════════════════
System prompt (role, context, instructions)         3,500 tok
Tool definitions (5 tools × ~800 tok each)          4,000 tok
─────────────────────────────────────────────────────────────
Fixed overhead:                                     7,500 tok

Per-supplier query (50 suppliers):
  Supplier data fetched from DB                     ~400 tok
  Tool call + result (2 round trips each)           ~600 tok
  Subtotal per supplier:                          ~1,000 tok

50 suppliers × 1,000 tokens:                      50,000 tok

Running conversation (50 turns of back-and-forth):  ~2,000 tok
Final summary generation:                           ~1,500 tok
─────────────────────────────────────────────────────────────
Estimated total:                                   61,000 tok

Available in Sonnet 4.6:                          200,000 tok
                                                  ──────────
Remaining headroom:                               139,000 tok

OK for this task.
═══════════════════════════════════════════════════════════════
```

Now change the scenario: same task, but each supplier has 30 days of historical pricing to compare against, and you're pulling the full invoice history for anomaly context.

```
REVISED ESTIMATE — with full invoice history
═══════════════════════════════════════════════════════════════
Fixed overhead:                                     7,500 tok
Invoice history per supplier (30 days × 5 SKUs)   ~8,000 tok
50 suppliers:                                     400,000 tok

Total needed:                                     407,500 tok
Available:                                        200,000 tok
                                                  ──────────
OVER BUDGET by:                                   207,500 tok ❌
═══════════════════════════════════════════════════════════════
```

You're over budget by 100%. The naive implementation doesn't work. You need a strategy — and that strategy is the topic of the next four days.

---

## What Happens When the Window Fills Up

Different systems handle this differently. The main strategies:

**1. Context compression / summarization**
Before the window overflows, the oldest turns are summarized into a compact representation and replaced. The agent continues with the summary instead of the full conversation.

Cost: some fidelity is lost. The model may not remember specific details from early in the conversation that were compressed away.

Claude Code (the system you're using right now) does this automatically as your conversation approaches context limits. The "compression" messages you see are exactly this mechanism at work.

**2. Windowing (sliding window)**
Keep only the most recent N turns in context. Older context is dropped entirely.

Cost: the agent truly can't see what happened more than N turns ago. For long tasks, this can cause repetition, contradictions with earlier decisions, or the agent losing track of a task goal stated at the start.

**3. Retrieval (RAG)**
Store conversation history, facts, and retrieved data externally. Bring in only what's relevant to the current step.

Cost: requires a retrieval system. Relevant retrieval is hard — if you retrieve the wrong chunks, the model proceeds with incomplete or misleading context.

**4. Task decomposition / subagents**
Break the work into subtasks, each handled by a fresh agent with its own context window. The orchestrator only passes what's needed for each subtask.

Cost: coordination overhead, handoff complexity. But this scales in a way that single-context approaches can't.

```
STRATEGY COMPARISON
═══════════════════════════════════════════════════════════════
              Fidelity   Complexity   Scales    When to use
──────────────────────────────────────────────────────────────
Summarization  Medium     Low         OK        Long conversations
Windowing      Low        Very low    OK        Streaming tasks
RAG            High*      Medium      Yes       Factual retrieval
Subagents      High       High        Yes       Complex multi-step
──────────────────────────────────────────────────────────────
* High fidelity only if retrieval is accurate
═══════════════════════════════════════════════════════════════
```

For Earnventory's supplier monitoring scenario: the right answer is almost certainly subagents (one per supplier batch) plus RAG for the invoice history. The orchestrator never sees all 400,000 tokens at once.

---

## Why This Is the Primary Engineering Constraint

When agent systems fail in production, the failure is usually attributed to something like "the model gave a wrong answer" or "the agent stopped making progress." The actual root cause is often context-related:

- The context window filled up and early context was compressed, losing the original task goal
- Tool definitions and system prompts were so verbose that there was almost no budget for actual reasoning
- Retrieved documents were too large and crowded out the conversation history
- The model started contradicting earlier decisions because those decisions were no longer in context

These are fixable problems — but they require understanding that context budget is the constraint, not model intelligence. A more "intelligent" model doesn't help you when you've run out of working RAM. The model is still the same; it just can't see the information it needs.

The engineering discipline of managing what's in the context window, how to compress or summarize what must leave, and how to retrieve what's needed from external storage is called **context engineering** — and it's the subject of Day 14.

---

## Earnventory Implications

Three practical principles for any Claude integration you build:

**1. Budget explicitly before you build.**
Before writing code, estimate your token budget. Add up system prompt, tool definitions, expected conversation length, and retrieved data. If you're over budget by 50%, rethink the architecture before implementing.

**2. Tool definitions are surprisingly expensive.**
Each tool definition (name, description, input schema) costs tokens. An integration with 15 tools can spend 10,000+ tokens on definitions before the first message. Define only the tools you actually need. Write concise descriptions.

**3. "The model forgot" is usually a context problem.**
If an agent starts contradicting earlier decisions or loses track of the task, check the context. The information it "forgot" probably scrolled out of the window. The fix is architectural (better context management), not a prompt tweak.

---

## What's Next in Mini-Module 1.3

Over the next four days:

- **Day 12:** The four types of memory agents can have — in-context, external/RAG, in-weights, in-cache. The filing cabinet gets a full taxonomy.
- **Day 13:** RAG — retrieval-augmented generation. How you give an agent access to a database far larger than its context window.
- **Day 14:** Context engineering as a discipline. What to put in the system prompt vs. retrieve at runtime vs. compress. The practical craft.
- **Day 15:** How Zazu's memory system actually works — MEMORY.md, session context, and the design decisions behind it.

---

## Free Resources

1. **Anthropic's Context Window Documentation**
   Official docs on Claude's context limits, input/output token caps, and pricing. Check the model comparison page — context window size varies significantly across the model family.
   https://docs.anthropic.com/en/docs/about-claude/models/overview

2. **"Long-Context Language Models" — Lilian Weng's Blog**
   A thorough survey of the challenges of long-context modeling — from the attention mechanism's quadratic cost to practical evaluation of whether models actually use long context well. Technical but accessible with patience.
   https://lilianweng.github.io/posts/2023-01-27-the-transformer-family-v2/

---

## One Sentence to Carry Forward

The context window is the agent's working RAM — every token in a call must fit inside it, it fills faster than you expect on real tasks, and almost every architectural decision in agent design is ultimately about managing what goes in, what comes out, and how to retrieve what can't fit.

---

*Day 11 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.3: Context, Memory, and State — Day 1 of 5*
