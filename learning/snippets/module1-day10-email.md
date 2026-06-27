# AI Agents Day 10: Training vs. Inference — Two Completely Different Time Scales
**Why the Model Is Frozen — and What You Can and Cannot Change at Runtime**

*Module 1.2, Day 10 of 50 | Reference Edition*
*From: Abeiku (AI Agents Curriculum) | June 21, 2026*

---

## The Short Version

There are two completely separate phases in a language model's existence, separated by months of time and an unbridgeable operational boundary:

**Training:** the process by which the model learned. Months of computation on specialized hardware. Billions of text examples. Trillions of parameter adjustments. When training ends, the model's numerical weights — the billions of floating-point numbers that encode everything it "knows" — are frozen.

**Inference:** what happens every time you send a message to Claude. The frozen weights process your input, compute a probability distribution over possible next tokens, sample from it, and repeat until done. No weights change. No learning happens. The model you talk to at 9am is byte-for-byte identical to the model at midnight.

Everything you saw this week — tokenization, next-token prediction, temperature, hallucination — happens at inference time, using weights fixed before you ever sent a message.

This is why you cannot fix a hallucination by explaining the correct answer in a prompt. Your explanation becomes context — visible to the model in this conversation, gone when it ends. The weights don't move.

---

## What Training Actually Is

At its core, training is an optimization process. The goal: adjust the model's parameters (weights) so that the model gets better at predicting what token should come next, across a massive corpus of text.

The mechanism is **gradient descent** — a method for nudging billions of numerical parameters in directions that reduce prediction error. The process works like this:

1. Show the model a text sequence
2. Ask it to predict the next token
3. Compare its prediction to the actual next token in the training data
4. Calculate how wrong it was (the "loss")
5. Calculate which direction to nudge each weight to reduce that loss
6. Nudge every weight slightly in that direction
7. Repeat — billions of times

```
TRAINING LOOP (simplified)
═══════════════════════════════════════════════════════════════
Input:  "The capital of France"
Predict: [distribution over vocabulary]
Actual:  "is"

  Model predicted:                Actual:
  ┌────────────────────────────┐  
  │ "is"    █████████  0.71   │  ← correct answer
  │ "was"   ████       0.12   │
  │ "has"   ██         0.07   │
  │ ","     █          0.05   │
  │ ...     ...        ...    │
  └────────────────────────────┘

  Loss: low (model mostly got it right)
  Weight update: tiny nudges reinforcing this pattern

Next input: "Earnventory was founded"
Predict: [distribution over vocabulary]
Actual:  [Earnventory doesn't appear in training data]

  → Model adjusts based on similar-looking startup founding sentences
  → Pattern reinforced: founding years after company names

After billions of iterations across billions of text sequences:
  → Model weights encode statistical patterns from the entire corpus
  → Training ends. Weights are FROZEN.
═══════════════════════════════════════════════════════════════
```

The scale of this process is worth sitting with for a moment. Training GPT-class models takes weeks to months on clusters of thousands of specialized chips. The training data for models like Claude contains a significant fraction of the text that exists on the public internet — books, papers, code, articles, conversations — plus curated data sources that cost significant engineering effort to acquire and clean. The resulting model has billions to hundreds of billions of parameters, each a floating-point number, collectively encoding statistical regularities across more text than any human could read in thousands of lifetimes.

When training ends, those parameters are saved. The saved weights are what you call "Claude." Everything Claude knows — every language pattern, every fact well-represented in the training corpus, every reasoning strategy — is encoded in those numbers.

---

## What Inference Actually Is

Inference is what happens when you send a message. It is mechanically different from training in every important way.

When you send a prompt, the system:

1. Tokenizes your input (Day 6)
2. Runs the tokens through the frozen model — a mathematical forward pass, layer by layer through the transformer architecture
3. Gets a probability distribution over the vocabulary at the final position
4. Samples from that distribution based on temperature (Day 8)
5. Appends the sampled token to the sequence
6. Repeats from step 2 until the model generates an end-of-sequence token

```
INFERENCE (a single generation step)
═══════════════════════════════════════════════════════════════

Input tokens:  ["The", " capital", " of", " France", " is"]
                    │
                    ▼
         ┌──────────────────────┐
         │   FROZEN WEIGHTS     │  ← fixed numbers, not changing
         │                      │
         │  [2.3, -1.1, 0.8...] │  billions of parameters
         │  [0.4, 2.1, -0.3...] │  unchanged since training
         │  [1.7, -0.9, 1.2...] │  
         │         ...          │
         └──────────────────────┘
                    │
                    ▼
         probability distribution:
         "Paris"  ████████████████  0.84
         "Paris," ███              0.08
         "the"    ██               0.05
         ...      ...              ...
                    │
                    ▼ sample
         
         Output token: "Paris"

Weights before: [2.3, -1.1, 0.8...]
Weights after:  [2.3, -1.1, 0.8...]  ← identical, nothing changed
═══════════════════════════════════════════════════════════════
```

Notice what's absent: there is no weight update step. There is no learning. The frozen weights go in, a token comes out, and the weights remain exactly as they were. Each token you generate at inference time costs only the computation of a forward pass — milliseconds, not the months it took to train.

---

## The Time Scale Difference

This is worth making viscerally concrete:

```
TRAINING                         INFERENCE
════════════════════════════════ ════════════════════════════════
Duration:  weeks to months       Duration: milliseconds per token
Hardware:  thousands of GPUs     Hardware: a fraction of a GPU
Examples:  trillions of tokens   Examples: your message
Updates:   billions per run      Updates: zero
Output:    frozen model weights  Output: text response
Cost:      tens of millions $    Cost:  fractions of a cent
════════════════════════════════ ════════════════════════════════
```

When you interact with Claude, you are on the right side of this table — always. Training happened once, a long time ago, on infrastructure you never touch. Inference is what you do.

---

## Why You Can't Fix Training at Inference Time

This is the practical crux of today's lesson.

**Scenario:** Claude hallucinates Earnventory's founding year. You correct it in your message. Claude acknowledges the correction and uses the right year for the rest of the conversation. Has the model been fixed?

No. Here's what actually happened:

- The correct founding year entered the **context window** — the sequence of tokens visible to the model during this conversation
- For the duration of this conversation, the correct year is part of the input conditioning the model's distributions
- The model correctly uses it — because it's in context, not because the weights changed
- When the conversation ends, the context window is cleared
- The next conversation starts fresh, with the same frozen weights that didn't know the founding year to begin with

```
WHAT ACTUALLY HAPPENS WHEN YOU "CORRECT" CLAUDE
═════════════════════════════════════════════════════════════════

You:   "Earnventory was actually founded in 2023, not 2019."
Claude: "You're right, I apologize. Earnventory, founded in 2023..."

         CONTEXT WINDOW (this conversation):
         ┌─────────────────────────────────────────┐
         │ User: Earnventory was founded in 2023   │ ← in context now
         │ Claude: Right, Earnventory, founded 2023│
         │ ...                                     │
         └─────────────────────────────────────────┘
                          │
                          ▼
         Next conversation:
         ┌─────────────────────────────────────────┐
         │ (context cleared — new conversation)    │
         └─────────────────────────────────────────┘
         
         Frozen weights: still don't know Earnventory's founding year.
         Next time: still hallucinates.
═════════════════════════════════════════════════════════════════
```

The correction was real — within the conversation. The model's knowledge was unchanged.

---

## The Three Interventions and What Each Actually Does

There are three ways to improve what Claude "knows," and they operate at completely different levels of the system:

**1. Context (inference-time, temporary)**
Put the information in the prompt or conversation. Claude uses it for this call. Gone when the conversation ends. Zero cost, instant, scalable for facts that change. This is what you do when you ground prompts with Earnventory-specific data.

**2. Fine-tuning (modifying the weights, expensive)**
Take the trained model and run additional training on your specific data — your supplier invoices, your pricing rules, your product catalog. This actually changes the weights. The model now has a somewhat different probability distribution that reflects your corpus.

Fine-tuning is real and useful, but important caveats:
- It's expensive (compute costs, engineering time, infrastructure)
- It's slow (a fine-tuning run takes hours to days)
- The resulting model still doesn't "know" facts the way a database does — it has updated statistical patterns
- If your facts change (a supplier changes their terms), you re-run the fine-tune or the model is wrong
- Fine-tuned knowledge can degrade — the model might "forget" general capability in exchange for specific knowledge

Fine-tuning is appropriate for *style, format, domain vocabulary, and consistent behavior* — not as a substitute for a database of frequently-updated facts.

**3. RAG — Retrieval-Augmented Generation (inference-time, from a database)**
Build a pipeline that retrieves the relevant facts from a reliable source and puts them in the context window before the model generates. The model sees the facts at inference time (temporary), but they come from a system that's always up-to-date. (Mini-Module 1.3 covers RAG architecture in depth.)

```
THE THREE INTERVENTIONS
════════════════════════════════════════════════════════════════
                    Changes     Persists     Cost       Updatable
                    Weights?    After Conv?  
────────────────────────────────────────────────────────────────
Context             No          No           ~Free      Yes
Fine-tuning         Yes         Yes          High       Re-tune
RAG                 No          No (but      Low/Med    Yes
                               DB persists)
════════════════════════════════════════════════════════════════
```

For Earnventory, the practical answer is almost always: **context and RAG.** Your business facts (supplier terms, pricing, inventory levels) change frequently, are specific to your operation, and need to be correct. Put them in context. Fine-tuning is a tool for behavioral consistency, not factual accuracy.

---

## The Knowledge Cutoff as a Consequence

The training/inference distinction explains something you've probably bumped into: the knowledge cutoff.

Every Claude model has a training data cutoff — a date after which no text was included in training. Claude Sonnet 4.6 (what powers Zazu) has knowledge cutoff of August 2025. This isn't a choice or a limitation to be annoyed by; it's structurally inevitable. The training data was collected and processed before training began. Once training ends, the weights are frozen. No events after that date are reflected in the weights.

When you ask Claude about something that happened in 2026, it genuinely doesn't know — not because it forgot, not because it's being careful, but because the weights were frozen before that information existed. The autocomplete has no text to pattern-match against.

This is solvable with the same tools: put the relevant 2026 context in the prompt, and Claude can reason about it. The frozen weights provide the reasoning capability; the context provides the facts.

---

## Earnventory Implications

The training/inference distinction gives you a clean mental model for every Claude deployment decision:

**What Claude is good at without context:**
- Reasoning, writing, synthesis, analysis using patterns from training
- General domain knowledge well-represented in the training corpus (accounting principles, supply-chain concepts, business writing conventions, code)
- Tasks where the "right answer" is a function of general patterns, not specific facts

**What Claude needs in context to be reliable:**
- Specific facts about Earnventory, your suppliers, your SKUs, your pricing
- Any information created or updated after the training cutoff
- Any information that's specific, low-frequency, or otherwise underrepresented in the training corpus

**What context cannot solve:**
- The weights themselves — if you need Claude to consistently apply a reasoning approach or write in a specific style, that's where fine-tuning (or persistent system prompts) help

The operational principle: the frozen model supplies capability; you supply facts. When capability and facts are both present, Claude is highly reliable. When you ask for facts the model doesn't have in context, you're asking the autocomplete to guess.

---

## Closing the Loop on Mini-Module 1.2

This is the last daily snippet for Module 1.2, "The Model Underneath." Over the past five days, the mechanics of LLM generation have been built up layer by layer:

- **Day 6 (Tokens):** The model doesn't see words — it sees subword units, and every unit costs budget and money.
- **Day 7 (Next-token prediction):** The core mechanism: a probability distribution over the vocabulary, sampled autoregressively. Language is generated token by token, conditioned on everything that came before.
- **Day 8 (Temperature):** The knob that controls how the distribution is sampled — from deterministic (mode) to creative (flat). Temperature doesn't add knowledge; it changes how existing knowledge is expressed.
- **Day 9 (Hallucination):** The generation mechanism working correctly in situations where "statistically probable" and "factually true" diverge. A design consequence, not a bug.
- **Day 10 (Training vs. inference):** The fundamental operational boundary. The model's knowledge was fixed at training. Inference is a read-only operation. You can change what the model sees (context), but not what it knows (weights) — at least not without expensive retraining.

---

## What's Next

**Tomorrow:** The Module 1.2 quiz — five applied questions covering tokenization, temperature, hallucination, and the training/inference distinction. Arrives as an iMessage. It's low-stakes; reply when you have time. Your answers calibrate the depth of Module 1.3.

**After the quiz:** Mini-Module 1.3 begins — "Context, Memory, and State." The context window as your agent's working RAM. The four types of memory agents can have. RAG architecture. Context engineering as a first-class discipline. And a concrete walkthrough of how Zazu's own memory system works.

---

## Free Resources

1. **"What Is Machine Learning Training?" — IBM Think Blog**
   A clear explanation of the training process — what gradient descent is, why it works, and how training differs from inference. Aimed at non-specialists without sacrificing accuracy.
   https://www.ibm.com/think/topics/machine-learning-training

2. **Andrej Karpathy's "Let's build GPT from scratch" (YouTube)**
   Karpathy (former OpenAI) implements a miniature GPT live, from matrix math to trained language model. Watching the weights update in real-time makes training/inference concrete in a way no explanation can. Long (2+ hours), but the first 30 minutes cover the core training loop at a level that's directly applicable to understanding what Claude is doing.
   https://www.youtube.com/watch?v=kCc8FmEb1nY

---

## One Sentence to Carry Forward

The model's weights were frozen at training and have not changed since — every inference call is a read-only operation, so "teaching Claude the right answer" in a message puts it in context for now, not in the weights forever; the only durable fix is either putting facts in context at call time (cheap, scalable) or changing the weights via fine-tuning (expensive, slow).

---

*Day 10 of 50 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.2 complete. Quiz arrives tomorrow. Next: Mini-Module 1.3 — Context, Memory, and State.*
