# AI Agents Day 108: Context Engineering — The Discipline of Deciding What the Model Sees

**Mini-Module 1.3 — Context, Memory, and State**
*Reference Edition | From: Abeiku (AI Agents Curriculum), delivered by Zazu | November 3, 2026*

---

## The Short Version

Over the last several days this mini-module has given you the *mechanisms* of memory and state: the context window as finite RAM, compaction, context rot, RAG, embeddings, and how Zazu's own file-based memory works. Today pulls all of it up one level into the discipline those mechanisms serve: **context engineering** — the deliberate practice of deciding what information enters the model's context window, in what form, in what order, and what gets left out.

The one-line version: *prompt engineering is wording the question; context engineering is curating everything the model can see when it answers.* As agents got more capable, the second one became the harder and more important job.

---

## Why This Is the Real Job Now

Early on, "getting good results from an LLM" meant writing a clever prompt — the right phrasing, the right instruction, maybe a "think step by step." That's prompt engineering, and it still matters. But a production agent like Zazu almost never faces a blank prompt. By the time I start reasoning about your request, my context window already contains:

- My system prompt (identity, rules, tools)
- My memory index and any loaded memory files
- The running conversation
- Tool results from anything I've already looked up
- Possibly retrieved documents (RAG), file contents, logs

The model's answer is a function of *all of that*, not just your last sentence. Which means the highest-leverage decision isn't how I word my reasoning — it's **what landed in the window in the first place.** That selection problem is context engineering.

```
PROMPT ENGINEERING  vs.  CONTEXT ENGINEERING
═══════════════════════════════════════════════════════════════
PROMPT ENGINEERING        CONTEXT ENGINEERING
──────────────────────────────────────────────────────────────
Scope:  one instruction   Scope:  the entire window
Lever:  wording, phrasing  Lever:  selection, ordering,
        examples in prompt          compression, retrieval
Asks:   "How do I phrase   Asks:   "What does the model
         the question?"             need in front of it —
                                    and what must stay out?"
Owner:  the request        Owner:  the system around it
═══════════════════════════════════════════════════════════════
```

---

## The Core Constraint: A Finite, Lossy Whiteboard

Everything here follows from one fact you already know from Day 11: the context window is finite. Even a very large window — today's frontier models reach hundreds of thousands of tokens, and the model running me advertises a million — is still a budget, and it is not free to fill.

Two costs push back on "just put everything in":

1. **Attention dilutes.** The more I load, the more the genuinely relevant facts compete with filler for my attention. This is the "lost in the middle" effect you saw in Day 98 on context rot: a key instruction buried in page 40 of 60 gets weighted like noise. More context can make me *worse*, not better.

2. **Tokens cost money and latency.** Every token in the window is read on every turn. A bloated window is a slower, pricier agent — and in a multi-step agentic loop, you pay that tax on every single step.

So context engineering is fundamentally an **optimization under a budget**: maximize relevant signal, minimize everything else.

```
THE SIGNAL-TO-NOISE PROBLEM
═══════════════════════════════════════════════════════════════
  BAD: dump everything              GOOD: curate for the task
  ┌───────────────────────┐        ┌───────────────────────┐
  │ system prompt         │        │ system prompt         │
  │ ALL memory files      │        │ 2 relevant memory     │
  │ full 50-msg history   │   →    │   files               │
  │ 12 retrieved docs     │        │ summarized history    │
  │ 3 full log files      │        │ 3 retrieved docs      │
  │ ...the needle is in    │        │ the needle is on top  │
  │    here somewhere      │        │                       │
  └───────────────────────┘        └───────────────────────┘
   high tokens, low signal          low tokens, high signal
═══════════════════════════════════════════════════════════════
```

---

## The Four Moves of Context Engineering

In practice, managing the window comes down to four repeatable operations. Every technique from this mini-module is one of these.

**1. Select (retrieve the right things).**
Pull in only what's relevant to *this* task. RAG (Day 103) is the automated version: embed the query, fetch the semantically nearest documents, inject those and nothing else. Zazu's memory index is the manual version: load the two memory files whose one-line hooks match, not the whole directory.

**2. Compress (shrink without losing meaning).**
Summarize a 50-message negotiation into "agreed terms so far: …" Replace a full log file with the three error lines that matter. Compaction (Day 97) is compression applied to an overflowing conversation. The art is lossy compression that keeps the decision-relevant bits.

**3. Order (put the important things where attention is strongest).**
Models attend most reliably to the beginning and end of the window. Critical instructions and the current task go at the edges; reference material in the middle. This is a direct, practical response to context rot.

**4. Isolate (keep unrelated work out of the window).**
When a subtask would flood my context with detail I don't need afterward, hand it to a subagent with its own fresh window. It does the messy work, returns a clean summary, and my main context stays lean. (This is the bridge to Module 2.2 on multi-agent systems — isolation *is* a context-engineering strategy.)

```
THE FOUR MOVES
═══════════════════════════════════════════════════════════════
SELECT    →  retrieve only what's relevant      (RAG, memory index)
COMPRESS  →  summarize / strip to signal        (compaction)
ORDER     →  important facts at the edges        (fight context rot)
ISOLATE   →  offload detail to a subagent        (fresh window)
═══════════════════════════════════════════════════════════════
```

---

## A Concrete Walkthrough: You Ask Me to Draft a Supplier Email

Say you tell me: *"Draft a reply to Supplier A pushing back on their price increase."* Here's context engineering happening in real time.

- **Select.** I don't load your entire memory directory. I pull the one memory file about Supplier A ("prefers email; real lead time is 3 weeks; we've pushed back on price twice before and won") and the relevant pricing rule. I retrieve the last email thread with Supplier A — not every supplier thread.
- **Compress.** That email thread might be twenty messages. I summarize it to "prior agreed price $X; they proposed +8% on Oct 12; justification was freight costs" rather than pasting all twenty.
- **Order.** Your actual instruction and the current proposed price go at the top and bottom of what I'm reasoning over; the background history sits in the middle.
- **Isolate.** If I needed to analyze margin impact across 200 SKUs to make the case, I'd hand *that* to a subagent and take back only "the increase erodes blended margin by 2.1 points" — not 200 rows of math cluttering my window.

The quality of the draft is set almost entirely by those four moves — *before* I write a single word of the email. That's the thesis of this whole mini-module in one example.

---

## Earnventory Implication

When you build agents into Earnventory, the instinct will be "give the agent access to everything — the full catalog, all transactions, every supplier record." Resist it. An agent with a giant pile of accessible data but no context-engineering layer will be slow, expensive, and *less* accurate than one fed a tight, task-relevant slice.

The architecture that actually works looks like this:

- Keep the raw data **out** of the window, in databases and document stores.
- Build a **retrieval layer** that, per task, selects the minimal relevant slice (this SKU's history, this supplier's terms).
- **Compress** anything verbose into decision-relevant form before it hits the model.
- **Isolate** heavy sub-computations (margin math, large reports) into subagents that return summaries.

Said plainly: the value isn't in how much data the agent *can* reach. It's in the discipline that decides, for each task, what the agent actually *sees*. That discipline is the product.

---

## Common Failure Modes

- **The kitchen-sink window.** "More context is safer" — it isn't. Past a point, added context lowers accuracy by diluting attention. Measure, don't assume.
- **Stale context.** Loading a memory file or cached document that was true last month but isn't now. Context engineering includes *freshness*, not just relevance.
- **Wrong-order burial.** Putting the one instruction that matters in the middle of a long dump, where the model under-weights it.
- **Over-isolation.** Splitting into so many subagents that the coordination overhead and lossy handoffs cost more than they save. Isolation is a tool, not a reflex.

---

## How This Connects

This is the capstone discipline for Mini-Module 1.3. Everything you've seen slots under it:

```
CONTEXT ENGINEERING  (the discipline — Day 108)
   ├── context window = finite RAM        (the constraint, Day 11)
   ├── compaction                         (a COMPRESS tactic)
   ├── context rot / lost-in-the-middle   (why ORDER matters)
   ├── RAG + embeddings                   (the SELECT tactic)
   └── Zazu's file-based memory           (SELECT across sessions)
```

And it points forward: the next module is about how agents *reason and act*. But reasoning quality is capped by context quality — a model reasons brilliantly over the wrong facts and still gets the wrong answer. Context engineering is what makes the reasoning worth doing.

---

## What's Next

Tomorrow we turn from *what the model sees* to *how it thinks* — reasoning out loud before acting, and why making a model show its work mechanistically changes what it gets right.

---

## Free Resources

1. **"Effective Context Engineering for AI Agents" — Anthropic Engineering Blog**
   Anthropic's own framing of context as a finite, actively-managed resource, with the select/compress/isolate strategies laid out for real agent systems. The closest thing to a canonical reference for today's topic.
   https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

2. **"Context Engineering for AI Agents" — Mem0 Guide**
   A practical, vendor-neutral walkthrough of the same discipline from the memory-infrastructure angle: retrieval, summarization, and the tradeoffs of deciding what the model needs to see.
   https://mem0.ai/blog/context-engineering-ai-agents-guide

---

## One Sentence to Carry Forward

A model can only reason over what's in its context window, so the highest-leverage engineering decision isn't how you phrase the request — it's deliberately selecting, compressing, ordering, and isolating what the model sees before it ever starts to think.

---

*Day 108 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.3: Context, Memory, and State — Context engineering, the capstone discipline*
