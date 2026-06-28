# AI Agents Day 12: Four Types of Memory Agents Can Have
**A Taxonomy That Changes How You Architect Everything**

*Module 1.3, Day 12 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 23, 2026*

---

## The Short Version

Agents have four distinct types of memory, each with different characteristics: **in-context** (the whiteboard), **in-weights** (training knowledge), **external/RAG** (the filing cabinet), and **in-cache** (a performance layer). Each has different size constraints, update latency, access cost, and persistence. Understanding which type to use for which information is a core architectural decision — one that determines whether your agent system is practical at scale or collapses under its own weight.

---

## Why the Taxonomy Matters

Yesterday you learned that the context window is the agent's RAM — finite, ephemeral, the primary engineering constraint. The natural follow-up question is: what do you do when the information you need doesn't fit in RAM?

The answer is that agents can draw on memory outside the context window — but the mechanisms are categorically different. Confusing them is one of the most common mistakes in agent system design. Teams spend weeks fine-tuning a model when they should have used retrieval. They stuff everything into the system prompt when they should have compressed it. They wonder why the agent "forgot" something it was never told to begin with.

The four memory types give you a precise vocabulary for these decisions. Let's walk through each one.

---

## Memory Type 1: In-Context Memory

**What it is:** Everything currently in the context window — the active whiteboard.

This is the only memory the model directly reasons over. Every word of the system prompt, the full conversation history, tool definitions, retrieved documents, tool results, and the current user message — all of it lives here. The model attends to all of it simultaneously when generating its next response.

**Characteristics:**

- **Size:** Bounded. Sonnet 4.6 has a 200,000-token limit; Haiku has less. It runs out.
- **Speed:** Instant. No retrieval step needed; it's already there.
- **Persistence:** None. When the conversation ends or context is compressed, it's gone.
- **Update latency:** Zero. You can change what's in context on every single turn.

**When to use it:** For anything the model needs to actively reason about *right now*. The task instructions, the current data being processed, the recent conversation history. If the model needs to reference it within this turn, it needs to be in context.

**Failure mode:** Trying to put everything in context. Teams that stuff 50-page product catalogs, complete invoice histories, and all prior conversation turns into the context window hit the limit, pay for tokens they don't use, and get worse results because the model's attention is spread thin across a massive, noisy context.

```
IN-CONTEXT MEMORY
═══════════════════════════════════════════════════════════════
┌──────────────────────────────────────────────────────────────┐
│  CONTEXT WINDOW (active right now)                          │
│                                                              │
│  System prompt ▓▓▓▓▓▓                                       │
│  Tool defs     ▓▓▓▓                                          │
│  History       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                             │
│  Retrieved doc ▓▓▓▓▓▓▓▓                                      │
│  User message  ▓▓                                            │
│  ← everything here is directly reasoned over →              │
│                                                              │
│  At session end: ERASED                                      │
└──────────────────────────────────────────────────────────────┘
```

---

## Memory Type 2: In-Weights Memory

**What it is:** Knowledge baked into the model's parameters during training. The model's intrinsic expertise.

When you ask Claude what the capital of France is, it answers correctly without any context telling it the answer. That knowledge lives in 70+ billion floating-point numbers — the model's weights — learned by processing trillions of tokens of human text. It's not retrieved; it's computed from the weights on every forward pass.

**Characteristics:**

- **Size:** Effectively unlimited in scope, but fixed at training time.
- **Speed:** Zero retrieval cost. It's embedded in the computation itself.
- **Persistence:** Permanent across all conversations, all users.
- **Update latency:** Months. Updating weights requires a new training run — expensive, slow, and requires significant data curation.

**When to use it:** You don't "use" it — it's always there. The question is when to *rely* on it vs. when to supplement with external memory. In-weights knowledge is excellent for stable, general-purpose facts: programming languages, scientific principles, logical reasoning, the structure of business emails. It's unreliable for recent events, specialized private data (your company's pricing rules), or anything that changes faster than training cycles.

**The critical insight:** You cannot update in-weights memory at inference time. When someone says "just tell Claude the right answer," that doesn't update the weights — it writes to in-context memory, which disappears when the session ends. Only fine-tuning (a new training run on your data) updates the weights, and that's expensive and slow.

**Failure mode:** Assuming Claude "learned" something you told it in a previous conversation. It didn't. That was in-context memory, and it's gone.

---

## Memory Type 3: External Memory (RAG)

**What it is:** Data stored outside the model — in a database, file system, or vector store — retrieved on demand and placed into context.

This is where the filing cabinet analogy does the most work. Your company's entire product catalog, every supplier invoice, all historical pricing data, your employee handbook — none of this fits in a context window. But you can store it in a database and retrieve the relevant portions when needed.

The retrieval mechanism for unstructured text is typically **vector search**: documents are converted into numerical vectors (embeddings) that encode semantic meaning. When the agent needs information, the query is converted to a vector and the most semantically similar documents are retrieved. This is Retrieval-Augmented Generation (RAG).

**Characteristics:**

- **Size:** Effectively unlimited. A vector database can store millions of documents.
- **Speed:** Requires a retrieval step — typically 50–200ms for a vector search.
- **Persistence:** Permanent and updatable. You can add, modify, or delete records at any time.
- **Update latency:** Near-zero. Add a document to the store and it's available on the next retrieval.

**When to use it:** For any information that is (a) larger than what fits in context, (b) frequently updated, or (c) only needed sometimes. Product catalogs, invoice histories, policy documents, past conversation summaries, user profiles. If the information is private to your organization and changes regularly, external/RAG is almost always the right answer.

**Zazu's MEMORY.md is a simple form of external memory:** a file written to disk, read back at the start of relevant conversations, and placed into context. It's not vector search — it's just a text file — but the principle is identical: store information externally, retrieve it when needed, inject into context.

**Failure mode:** Retrieval inaccuracy. If the vector search returns the wrong chunks — similar-sounding but irrelevant — the model proceeds with misleading context and produces confident, wrong outputs. Retrieval quality is the hardest problem in RAG systems.

---

## Memory Type 4: In-Cache Memory (KV Cache)

**What it is:** A performance optimization that stores the intermediate computations from processing fixed prefixes, so they don't need to be recomputed on every API call.

This one is the most technical, and it doesn't affect the agent's reasoning — only its speed and cost. Here's why it exists:

When Claude processes a prompt, the transformer runs attention computations over every token. These computations generate intermediate matrices called the **key-value (KV) cache** — the "attention memory" that the model uses to produce each output token. For a long system prompt, those computations are expensive and identical on every call.

Prompt caching stores these KV matrices across API calls. If your system prompt is 10,000 tokens and you cache it, subsequent calls with the same prefix skip the expensive recomputation — they just read the cached matrices. This dramatically reduces latency and cost for long, stable prefixes.

**Characteristics:**

- **Size:** Bounded by what the provider caches. Anthropic's prompt caching has a 5-minute TTL (time-to-live) by default.
- **Speed:** Reads are fast; misses fall back to full computation.
- **Persistence:** Temporary. The cache expires (5 min by default for Anthropic). It also resets if the prefix changes.
- **Update latency:** Instantaneous — caching is transparent. But any change to the cached prefix invalidates it.

**When to use it:** Whenever you have a long, stable prefix (system prompt, fixed instructions, reference documents) that doesn't change between calls. In Zazu's case, the system prompt and the family context section could be marked for caching — every morning's call benefits from not recomputing them.

**Failure mode:** Stale reasoning from over-caching. If the system prompt changes (new instructions, updated family context) but you're still hitting a cached version, the model responds based on outdated configuration. This is subtle and can manifest as inconsistent behavior across sessions.

---

## The Full Comparison

```
FOUR MEMORY TYPES AT A GLANCE
═══════════════════════════════════════════════════════════════════
                In-Context   In-Weights   External/RAG   In-Cache
───────────────────────────────────────────────────────────────────
Location        Window       Parameters   External DB    KV matrices
Size limit      Hard (200K)  None (fixed) Unlimited      TTL-bound
Access speed    Instant      Instant      +50–200ms      Fast (hit)
                                                         Slow (miss)
Persistence     Session      Permanent    Permanent      ~5 min
Update lag      Zero         Months       Near-zero      Seconds
Who updates it  You (each    Training     You (anytime)  Auto
                turn)        team
Visible to      Model        Model        Only if        Model
model?          directly     (via         retrieved      (via cache)
                             weights)     into context
───────────────────────────────────────────────────────────────────
Best for        Active       General      Private/large/ Fixed-prefix
                reasoning    world        updated data   perf
                             knowledge
Failure mode    Overflow     Stale/wrong  Bad retrieval  Stale cache
═══════════════════════════════════════════════════════════════════
```

---

## How They Combine: Zazu on a Morning Run

Here's what all four types look like in a single Zazu interaction — the morning board briefing:

```
ZAZU MORNING BRIEFING — MEMORY TYPES IN ACTION
═══════════════════════════════════════════════════════════════════

START OF CALL
│
├─ IN-WEIGHTS kicks in immediately
│   Claude already knows: what "email" is, how to write a summary,
│   what "calendar event" means, how to reason about schedules.
│   No context needed.
│
├─ IN-CACHE loads the stable prefix (if cached)
│   System prompt and family context are pre-computed.
│   Saves ~2–3 seconds vs. recomputing on each call.
│
├─ EXTERNAL/RAG retrieves relevant memory
│   Zazu reads MEMORY.md, loads family context, prior notes.
│   Injects relevant portions into context.
│
│                          ↓
│               CONTEXT WINDOW ASSEMBLES
│   System prompt | Cached context | Retrieved memories |
│   Today's emails | Calendar events | Current user message
│
└─ IN-CONTEXT is now the active whiteboard
    Everything assembled above. Claude reasons over this
    to produce today's briefing.

═══════════════════════════════════════════════════════════════════
```

The four types aren't alternatives — they work together. In-weights provides the reasoning substrate. In-cache makes repeated calls cheap. External/RAG provides the specific, private, updated information. In-context is where it all comes together.

---

## Earnventory Implications

**Design question: Where do your pricing rules live?**

Suppose Earnventory has a detailed set of pricing rules — margin thresholds, supplier discount tiers, tax treatment by product category. You need an agent to apply these rules when evaluating purchase orders. Which memory type?

- **In-weights?** No. Claude wasn't trained on your rules. And you'd need to fine-tune to add them — expensive, slow, overkill.
- **In-context (system prompt)?** Maybe, if they're short and stable. A 200-line pricing policy fits in a system prompt comfortably. If they rarely change and are always relevant, this is the simplest option.
- **External/RAG?** Yes, if the rules are long, frequently updated, or only sometimes relevant. Store them in a database, retrieve the relevant rules per transaction type. This is the more scalable pattern.
- **In-cache?** You'd still put them in context — but if the rules are a fixed prefix, prompt caching reduces the cost of including them every call.

The right answer depends on your specific situation. The point is that you now have the vocabulary to make that decision deliberately, not accidentally.

---

## What's Next in Mini-Module 1.3

- **Day 13:** RAG — how retrieval-augmented generation actually works. Vector embeddings, semantic search, how the filing cabinet is organized and searched. The practical mechanics behind "give the agent access to your database."
- **Day 14:** Context engineering as a discipline. Deciding what goes in the system prompt vs. what to retrieve vs. what to compress. The craft of managing the whiteboard.
- **Day 15:** How Zazu's memory system works — MEMORY.md, session context, what persists vs. what doesn't, and why those are design choices, not limitations.

---

## Free Resources

1. **"The Four Types of Memory in AI Agents" — Mem0 Blog**
   Mem0 is a memory infrastructure company for AI agents. Their blog covers the memory taxonomy from an engineering perspective, with practical guidance on when to use each type. Directly relevant to today's topic.
   https://mem0.ai/blog/context-engineering-ai-agents-guide

2. **"Prompt Caching with Claude" — Anthropic Docs**
   The official documentation for in-cache memory (prompt caching in Claude). Explains the TTL, pricing implications, how to structure prompts to maximize cache hits, and how to measure cache effectiveness. Worth bookmarking for any Earnventory integration.
   https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

---

## One Sentence to Carry Forward

Agents have four memory types — in-context (what it's looking at), in-weights (what it knows from training), external/RAG (what it can look up), and in-cache (what it pre-computed for speed) — and every architectural decision in an agent system is ultimately a decision about which type carries which information.

---

*Day 12 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.3: Context, Memory, and State — Day 2 of 5*
