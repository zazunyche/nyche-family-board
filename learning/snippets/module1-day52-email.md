# AI Agents Day 52: Mini-Module 1.3 Quiz — Context, Memory, and State

---

## What This Quiz Is For

You've just finished Mini-Module 1.3 — nine days covering the context window, the four types of agent memory, retrieval-augmented generation, context engineering as a discipline, Zazu's actual memory architecture, context compaction, and what happens when the whiteboard runs out of space.

That's a lot of ground. The quiz exists not to grade you but to surface what landed and what needs reinforcement before we move forward. Brief answers are fine. The goal is honest signal — not performance. If a question stumps you, that's exactly what it's supposed to reveal.

Five questions below, each with scaffolding: what concept it's testing, what to think about, and what a strong answer includes. Don't read the scaffolding as hints — read it as the lens the question is designed to put on your thinking.

Reply to the iMessage version with brief answers. Take your time.

---

## Question 1

**You're building an Earnventory feature where an agent helps a supplier negotiate purchase orders. The negotiation can go 50+ back-and-forth messages. What memory strategy do you use to prevent context overflow?**

**What this is testing:** Your ability to apply the four-memory-type framework to a real architectural problem, not just recite the taxonomy. A 50-message negotiation is a long in-context session — it will hit compaction. The question is what you do about it *by design*, before it becomes a crisis.

**What to think about:** Which facts from the negotiation need to survive if the context gets compacted? Which don't? What's the difference between information that belongs in-context (current negotiation state) vs. external storage (the agreed terms once reached)? Is there a role for RAG here — and if so, what retrieves what?

**What a strong answer includes:**
- Recognition that 50+ turns will exhaust in-context memory and that compaction will happen
- A specific strategy: external storage writes at each checkpoint (agreed terms, positions, counteroffers), so the agent can re-load state at the start of each session or after compaction
- Acknowledgment of what can stay in-context (active reasoning, current turn's details) vs. what must be externalized (anything you can't afford to lose to summarization)
- Optionally: consideration of short, focused sessions rather than one marathon session — each negotiation round as its own bounded context

---

## Question 2

**What's the difference between "in-weights" memory and "in-context" memory? Give an example of something Claude knows from training vs. something it needs in context to "know."**

**What this is testing:** The distinction between what the model baked in at training time — permanent, universal, unchangeable at runtime — and what you have to explicitly supply each time. This matters enormously for Earnventory: you cannot change what Claude knows from training. You can only control what's in context.

**What to think about:** In-weights memory is what the model learned during months of training on trillions of tokens — the meaning of words, the structure of negotiations, the concept of margin, the syntax of Python, world knowledge through its training cutoff. You never have to tell Claude what "purchase order" means. In-context memory is everything you load into the prompt before Claude responds — your system prompt, the conversation so far, retrieved documents, tool results.

**What a strong answer includes:**
- Clear definition: in-weights = trained parameters; in-context = the current prompt contents
- A concrete example from Claude: Claude knows from training that a "net-90 payment term" means payment due 90 days after invoice (in-weights). But Claude does not know your specific Osei account has a negotiated exception to standard terms — you have to tell it in context or retrieve it via RAG (in-context).
- The operational implication: you cannot fix wrong in-weights knowledge at inference time. You can only override it by providing explicit in-context information.

---

## Question 3

**You want your Earnventory agent to "know" your company's pricing rules. Should you put them in the system prompt, retrieve them via RAG, or fine-tune the model? Argue for one approach.**

**What this is testing:** Practical judgment about when to use which memory type for real business data. There's no universally right answer here — the question is whether you can articulate a defensible position and understand the tradeoffs.

**What to think about:**

*System prompt* works if pricing rules are stable, small in volume (fit comfortably in the system prompt without crowding out other content), and always relevant to every interaction. The advantage: always present, no retrieval latency. The disadvantage: if rules change, you have to update the system prompt and re-deploy. Also, if rules grow to hundreds of entries, the system prompt becomes unwieldy.

*RAG* works if pricing rules are numerous, change frequently, or vary by context (supplier, SKU, region, date). You'd store rules in a vector database or structured store; the agent retrieves the relevant subset at query time. The advantage: always up to date, scales to thousands of rules, doesn't bloat the system prompt. The disadvantage: retrieval adds latency and can fail (a missed retrieval means the agent operates without the relevant rule).

*Fine-tuning* is almost never the right answer for factual, frequently-updated business data. Fine-tuning is expensive, slow, requires re-training whenever rules change, and doesn't give you the precision of verbatim retrieval — the model may "blend" rules rather than apply them exactly. Reserve fine-tuning for behavioral changes (tone, format, task type) not factual injection.

**What a strong answer includes:**
- A clear choice with a reason: most likely system prompt (if rules are compact and stable) or RAG (if rules are numerous or dynamic)
- Explicit rejection of fine-tuning for this use case, with the reason
- At least one tradeoff acknowledged for the chosen approach

---

## Question 4

**Why is RAG generally preferred over fine-tuning for factual, frequently-updated information? What are the tradeoffs?**

**What this is testing:** A deeper understanding of why the two approaches aren't interchangeable — and specifically why fine-tuning is a poor fit for factual knowledge that changes.

**What to think about:** Fine-tuning bakes facts into model weights at training time. To update those facts, you re-train — which means another round of compute, data preparation, and deployment. There's also no guarantee the model will recall a specific fine-tuned fact verbatim; the training process can "average" conflicting signals. And the training/inference gap means you can't selectively update one fact without risking interference with others.

RAG, by contrast, retrieves facts at inference time from an external store you control. Update the store, and every subsequent query immediately benefits. The facts are returned verbatim, not blended. You can audit exactly what the model received. And retrieval failures are visible and debuggable.

**What a strong answer includes:**
- The core asymmetry: RAG updates in real time; fine-tuning requires re-training
- Verbatim precision: retrieved facts are exact; fine-tuned knowledge is probabilistic
- The auditability advantage: you can log what RAG returned; you can't inspect what fine-tuning "stored"
- RAG's failure modes: retrieval miss (relevant document not returned), chunking artifacts (fact split across chunks), embedding drift (search returns wrong documents), latency
- Fine-tuning's appropriate use case: behavioral changes — tone, format, task type, style — not factual injection

---

## Question 5

**Zazu's MEMORY.md file stores persistent facts about the family. What kind of memory is this? What are the failure modes?**

**What this is testing:** Your ability to classify a concrete real-world system against the four-type taxonomy — and then reason honestly about where it can break.

**What to think about:** MEMORY.md is a file on disk that Zazu reads at the start of each session. It contains entries like "Dad is building Earnventory" or "preferred grocery store is Whole Foods." What kind of memory is this?

It's not in-weights (it wasn't in Claude's training data). It's not in-cache (the KV cache is a different mechanism, and MEMORY.md preloads into the prompt). It's a form of **external memory** — it lives outside the model, is loaded explicitly into context, and persists across sessions. Specifically, it's closer to the "in-context loaded from external file" pattern: persistent storage that becomes in-context at session start. Some would call this a hybrid of external and in-context — stored externally, consumed in-context.

**What a strong answer includes:**
- Classification: external memory (persisted outside the model, loaded into context — sometimes described as the "file-based external memory" pattern)
- Failure mode 1: **Staleness** — MEMORY.md entries are written at a point in time and may not reflect current reality (Dad finished Earnventory's v1; the entry still says "building Earnventory"). Zazu doesn't know the memory is stale.
- Failure mode 2: **Write failure** — if Zazu encounters something worth remembering but fails to write the memory file, the fact is permanently lost. There's no automatic re-derivation.
- Failure mode 3: **Size creep** — MEMORY.md grows over time, consuming more and more of the context window every session. Very old, irrelevant entries aren't automatically pruned.
- Failure mode 4: **Conflict** — two entries in MEMORY.md may contradict each other if an update was written without removing the old entry. Zazu may try to reconcile them or may act on the wrong one.
- Optionally: **Trust** — MEMORY.md is written by Zazu itself; an error in memory-writing logic could embed a false fact that then persists indefinitely.

---

## After the Quiz

Reply with however much you want to say. I'll read your answers and calibrate from here.

If most of this landed cleanly, we're ready to move into Mini-Module 1.4: **Reasoning and Planning** — chain-of-thought, the ReAct pattern, Claude's extended thinking mode, and when agents should plan ahead vs. react turn by turn. It's where the agent loop gets genuinely interesting.

If any question surfaced a gap, that's the right outcome — we'll add a targeted review snippet before moving on.

---

*Resources used across Mini-Module 1.3:*
- Mem0's Context Engineering Guide: https://mem0.ai/blog/context-engineering-ai-agents-guide
- Weaviate's Vector Embeddings Explained: https://weaviate.io/blog/vector-embeddings-explained
- Anthropic Claude Code memory and compaction docs: https://docs.anthropic.com/en/docs/claude-code/memory
- Pinecone long-context management guide: https://www.pinecone.io/learn/long-context/

---

*AI Agents curriculum — Designed by Abeiku for the Nyche family. Day 52, Mini-Module 1.3 Quiz: Context, Memory, and State.*
