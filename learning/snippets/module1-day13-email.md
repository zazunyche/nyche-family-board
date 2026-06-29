# AI Agents Day 13: RAG — Teaching the Agent What It Doesn't Know
**How Vector Embeddings and Semantic Search Give Agents Access to Your World**

*Module 1.3, Day 13 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 29, 2026*

---

## The Short Version

Retrieval-Augmented Generation (RAG) is the standard technique for giving an agent access to information that is too large for the context window and too private or dynamic to be in the model's training weights. Documents are converted into numerical vectors called **embeddings** that encode semantic meaning. When the agent needs information, the query is also converted to a vector and the most semantically similar document chunks are retrieved and placed into context. The model then generates its response with those retrieved chunks as grounding. RAG is usually better than fine-tuning for private, frequently updated information — it's cheaper, faster to update, and the reasoning is transparent.

---

## Why Yesterday's Taxonomy Led Here

You now know that agents have four memory types. In-weights gives Claude its baseline knowledge — but that knowledge was frozen at training time, can't include your private data, and can't be updated without a new training run. In-context is where the model reasons — but it's finite and expensive. External/RAG is the mechanism that bridges those two constraints: store your private data externally, retrieve what's relevant, and inject it into context just in time for the model to use it.

The question "how do agents know things that aren't in their training data?" is answered almost entirely by RAG. It is the workhorse of production agent systems.

---

## Why Not Just Put Everything in Context?

The naive approach is: if the model needs access to your Earnventory product catalog, just paste the whole thing into the system prompt.

This fails at scale. Consider:

- A 10,000-SKU catalog with descriptions, pricing tiers, supplier notes, and historical margins might be 5–10 million tokens. Current context limits cap at 200,000 tokens.
- Even if it fit, you'd pay for every single token on every single API call — whether the current query needed it or not.
- Performance degrades. Research on "lost in the middle" effects shows that models pay less attention to content buried in the middle of extremely long contexts. A model given a 200K-token context to answer a simple question about one SKU is attending to a lot of noise.
- It's static. If you update a SKU's price, you must regenerate and re-inject the entire catalog.

RAG solves all four of these: it's not size-limited, you only pay for what you retrieve, retrieval surfaces the relevant signal, and updates to the data store are immediately available.

---

## Why Not Just Fine-Tune?

Fine-tuning is the other obvious answer: train the model on your private data so it "knows" it in-weights. This works, but with serious tradeoffs.

**Fine-tuning is expensive.** A single fine-tuning run on a large model can cost thousands of dollars in compute and weeks of engineering time to prepare training data, run the job, evaluate, and re-deploy.

**Fine-tuning is slow to update.** If your supplier changes a price tier, you cannot update a fine-tuned model in minutes. You rerun training — which means you're always working from a snapshot that is at least weeks old.

**Fine-tuning is opaque.** When a fine-tuned model states a fact, you cannot see which training example it came from. If it hallucinates a pricing rule, you have no trace. With RAG, the retrieved chunks are visible in context — you can inspect exactly what the model was shown and audit the output accordingly.

**Fine-tuning does not guarantee recall.** Models trained on specific facts can still hallucinate them. Fine-tuning adjusts statistical tendencies; it doesn't install facts with database-level reliability.

The right comparison:

```
FINE-TUNING vs. RAG
═════════════════════════════════════════════════════════════════
                    Fine-Tuning          RAG
─────────────────────────────────────────────────────────────────
Cost to set up      $$$$ (compute)       $ (embedding + vector DB)
Update lag          Weeks (retrain)      Minutes (add to store)
Transparency        Opaque               Inspectable (chunks visible)
Reliability         Statistical          Retrieval-exact (when good)
Best for            Behavior/style       Facts and private data
                    adjustment           (frequently updated)
─────────────────────────────────────────────────────────────────
Rule of thumb       Use for HOW          Use for WHAT
                    the model speaks     the model knows
═════════════════════════════════════════════════════════════════
```

Fine-tuning teaches the model to behave differently. RAG teaches the model what to say. These are separate problems.

---

## How RAG Works — The Full Pipeline

Let's trace a complete RAG interaction, step by step.

**Step 1: Ingestion (offline, done once)**

Every document in your knowledge base — invoices, product specs, pricing policies, supplier contracts — is passed through an **embedding model**. The embedding model converts each chunk of text into a vector: an array of floating-point numbers, typically 768 to 3,072 dimensions depending on the model.

Each vector is a coordinate in a very high-dimensional space. The geometry of that space encodes meaning: semantically similar texts land near each other; dissimilar texts are far apart. These vectors are stored in a **vector database** (Pinecone, Weaviate, Chroma, pgvector, etc.) along with the original text and metadata.

**Step 2: Query encoding (at inference time)**

When a user asks the agent a question — or when the agent decides it needs more information to proceed — the query text is passed through the same embedding model. This produces a query vector in the same high-dimensional space.

**Step 3: Similarity search**

The vector database performs a **nearest-neighbor search**: it finds the k stored vectors most similar to the query vector, where similarity is typically measured by cosine similarity (the angle between vectors). This is extremely fast — modern vector databases can search millions of embeddings in milliseconds.

**Step 4: Context injection**

The top-k retrieved chunks (typically 3–10) are injected into the context window, usually in a clearly delimited section:

```
<retrieved_context>
[Chunk 1: Supplier A pricing policy, updated 2026-05-12]
...Tier 2 pricing applies when monthly order volume exceeds $50,000...

[Chunk 2: Margin calculation rules, updated 2026-04-01]
...Minimum margin threshold for Category B SKUs is 18%...
</retrieved_context>
```

**Step 5: Generation with grounding**

The model now generates its response. The retrieved context is visible in the context window, so the model can directly reference it — and the output can be verified against the source chunks.

```
RAG PIPELINE — END TO END
═══════════════════════════════════════════════════════════════════

INGESTION (offline)
───────────────────
  Documents ──► Chunker ──► Embedding Model ──► Vector DB
   (invoices,    (split       (text → vector)    (stores vectors
    policies,     into                             + raw text)
    catalog)      ~512-token
                  chunks)

INFERENCE (each query)
──────────────────────
  User query ──► Embedding Model ──► Query vector
                                          │
                                          ▼
                                    Vector DB search
                                    (find top-k similar)
                                          │
                                          ▼
                              Retrieved chunks (raw text)
                                          │
                              ┌───────────▼────────────────┐
                              │    CONTEXT WINDOW           │
                              │  System prompt              │
                              │  Retrieved chunks  ◄── HERE │
                              │  User message               │
                              └────────────┬───────────────┘
                                           │
                                    LLM generates
                                    grounded response

═══════════════════════════════════════════════════════════════════
```

---

## Vector Embeddings: What They Actually Are

The embedding step deserves more attention, because it's doing real work.

An embedding model is a neural network trained specifically to map text into vector space such that meaning is preserved in geometry. The model you use to embed documents and the model you use to embed queries must be the same — they need to share the same geometric space.

Here's the intuition:

```
VECTOR SPACE (simplified to 2D for illustration)
═══════════════════════════════════════════════════

         "out of stock"  ×
                          ×  "zero units remaining"
                          ×  "inventory depleted"

                                        ×  "product discontinued"

   ×  "invoice overdue"
   ×  "payment pending"


  ← dissimilar from each other  ·  similar to each other →

In actual embedding space (768–3072 dimensions), "out of stock"
and "zero units remaining" are very close. "Invoice overdue"
is far from both. The geometry encodes what the words mean,
not just what they say.
```

This is why RAG is called **semantic** search. You're searching by meaning, not by keyword. A keyword search for "inventory" would miss "units remaining." A semantic search finds it because the vectors are close.

Embeddings are generated by models like OpenAI's `text-embedding-3-large`, Anthropic's internal embedding models, or open-source alternatives like Nomic Embed or BGE. Each document chunk typically maps to a vector of 768–3,072 floating-point numbers. A 10,000-document knowledge base at 512 tokens per chunk produces ~10,000 vectors — a few hundred MB of storage, trivially searchable in milliseconds.

---

## Chunking: The Underappreciated Problem

The hardest part of building a good RAG system is often not the retrieval — it's the **chunking strategy**: how you split documents into retrievable units.

Chunk too small (50 tokens): chunks lose context. "18%" retrieved without the surrounding sentence is useless.

Chunk too large (2,000 tokens): you retrieve big slabs of text that dilute the signal, use more context tokens, and may include irrelevant content alongside what was useful.

Common strategies:
- **Fixed-size chunks:** Simple, predictable, fast. Works reasonably for uniform documents.
- **Sentence/paragraph chunking:** Respects natural language structure. Better for prose.
- **Semantic chunking:** Split at topic boundaries detected by an embedding model. Most accurate, more expensive.
- **Hierarchical chunking:** Store both small chunks (for precise retrieval) and larger parent chunks (for richer context), and return the parent when a child chunk matches.

For Earnventory, invoice documents might chunk by line item. Policy documents might chunk by section. The right strategy depends on how users will query — and tuning it is an iterative process.

---

## RAG in Earnventory: A Concrete Example

**The scenario:** An agent that helps evaluate purchase orders against Earnventory's pricing policies and margin thresholds.

**What goes in the vector store:**
- Supplier contracts (pricing tiers, discount schedules)
- Internal margin rules per product category
- Historical supplier performance notes
- Product specs and cost structure

**What happens at inference:**
1. A new purchase order arrives: 200 units of SKU `VIN-RSL-2024` from Supplier A at $48/unit
2. The agent generates a query: "pricing tier and margin rules for Supplier A, Riesling category"
3. Vector DB returns: Supplier A's contract (≥150 units = Tier 2, $45/unit max), Category B margin threshold (≥18%)
4. Agent performs the math in context: $48 > $45 Tier 2 — overprice. At current retail, margin would be 14% — below threshold
5. Agent responds: flag the order, suggest counter-offer at $44/unit

Without RAG, the agent cannot access any of this. With RAG, it reasons over current, private, auditable data — in seconds.

---

## The Hard Part: Retrieval Quality

RAG's Achilles heel is retrieval accuracy. If the wrong chunks are retrieved — similar-sounding but semantically off — the model proceeds with misleading context and produces confident, wrong outputs.

The canonical failure modes:
- **Low recall:** The right chunk exists in the store but isn't in the top-k results. The model hallucinates instead of retrieving.
- **Low precision:** Irrelevant chunks are retrieved because they share surface vocabulary with the query. The model reasons from noise.
- **Chunk boundary errors:** The answer spans two chunks that are retrieved separately, losing context between them.
- **Stale embeddings:** The raw document was updated but the embedding wasn't re-generated. The vector now points to a ghost of the old version.

These failures are fixable — through better chunking, hybrid search (combining vector similarity with keyword search), re-ranking models, and regular re-indexing pipelines. But they require deliberate engineering. RAG is not "plug in a vector database and you're done."

---

## What's Next in Mini-Module 1.3

- **Day 14:** Context engineering as a discipline — the craft of deciding what goes in the system prompt vs. what to retrieve vs. what to compress. Why this is now a distinct engineering specialty.
- **Day 15:** How Zazu's memory system actually works — MEMORY.md, session context, what persists vs. what doesn't, and why those choices were made deliberately.

---

## Free Resources

1. **Weaviate's Vector Embeddings Explained**
   A clear, well-illustrated guide to what vector embeddings are, how similarity search works, and how to think about the geometry of semantic search. Start here if you want the visual intuition.
   https://weaviate.io/blog/vector-embeddings-explained

2. **Mem0's Context Engineering Guide for AI Agents**
   Practical coverage of how retrieval fits into the broader problem of context management — chunking strategies, when to use RAG vs. system prompt vs. summarization. Earnventory-relevant throughout.
   https://mem0.ai/blog/context-engineering-ai-agents-guide

---

## One Sentence to Carry Forward

RAG solves the "the model doesn't know your data" problem by converting documents into semantic vectors, retrieving the most relevant chunks at query time, and injecting them into context — giving the agent accurate, up-to-date, auditable access to private information without the cost or latency of fine-tuning.

---

*Day 13 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.3: Context, Memory, and State — Day 3 of 5*
