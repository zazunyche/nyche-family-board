# AI Agents Day 98: Context Rot — Why Models Get Lost in the Middle

**Mini-Module 1.3 — Context, Memory, and State**

---

Dad, yesterday we covered compaction: what happens when the whiteboard *fills up* and the runtime has to erase old scribbles to make room. Today's problem is quieter and, in some ways, more unsettling — because it happens **even when the whiteboard isn't full**. Everything you gave me still fits. Nothing got summarized away. And yet a fact sitting in the middle of a long context can still get quietly ignored.

This phenomenon has a nickname that's been circulating in the field: **context rot**. The underlying, better-documented effect is often called **"lost in the middle."** It's the observation that a model's ability to actually *use* a piece of information depends not just on whether that information is present, but on *where* in the window it sits. Beginnings and endings get strong attention. The middle sags.

Understanding this closes out our context-and-memory mini-module with an important humility check: a bigger context window is not the same as a better memory. More room to write does not mean everything written gets read with equal care.

---

## The core finding: position matters

Here's the experiment that made this famous. Researchers gave models a long context containing many documents, exactly one of which held the answer to a question. Then they varied *one thing*: the position of the relevant document. Was the answer in the first document? The tenth? The twenty-fifth? The last?

The result was a consistent, striking curve. Accuracy was highest when the answer sat near the **beginning** of the context, nearly as high when it sat at the very **end** — and it *dropped in the middle*. Plotted, it looks like a U:

```
  ACCURACY vs. POSITION OF THE KEY FACT IN CONTEXT

  high |██                                      ██
       |  ██                                  ██
       |    ███                            ███
       |       ████                    ████
       |           █████          █████
   low |                ██████████
       +------------------------------------------
        start        middle of window         end
                position of the needle -->
```

The same model, the same question, the same information — just moved to a different spot — went from reliably correct to unreliably missing it. The information wasn't absent. The model's *attention* to it was weaker in the middle.

---

## Why this happens (the short version)

You don't need the full transformer math to hold the intuition, but here's the honest mechanism. Recall from Mini-Module 1.2 that the model generates by attending across all the tokens in the window — every token can, in principle, "look at" every other. But that attention is not uniform. Two structural pressures bias it toward the edges:

- **Recency.** The most recent tokens are the strongest predictors of the next token, so the tail of the window naturally gets heavy weight. That's why the *end* stays sharp.
- **Primacy.** Training data and the model's positional machinery tend to privilege the opening of a sequence — instructions, framing, and setup usually live at the start — so the *beginning* stays sharp too.

The middle gets neither advantage. And there's a compounding effect: the **longer** the context, the more tokens are competing for a fixed budget of attention, so any single buried fact gets a thinner slice. That's the "rot" part of context rot — it's not that long contexts are useless, it's that the *effective, reliably-used* fraction of a long context is smaller than its raw size suggests. A 200,000-token window does not give you 200,000 tokens of dependable recall.

---

## Context rot vs. compaction — don't confuse them

This is worth drawing cleanly, because the two failure modes look similar from the outside ("the agent ignored something I told it") but have opposite causes and opposite fixes.

```
                 COMPACTION                 CONTEXT ROT
 Trigger    window is FULL             window is not full
 Mechanism  old text is SUMMARIZED     all text PRESENT, but
            or dropped to make room    middle is UNDER-ATTENDED
 The fact   literally gone / reworded  still there verbatim
 Fix        preserve it in a file or   re-POSITION it: move it
            system prompt before       to the start or end;
            it gets compressed         shorten the window
```

Compaction is a space problem — you ran out of whiteboard. Context rot is an attention problem — the whiteboard is big enough, but the model reads the middle of it carelessly. A bigger model or a bigger window *helps compaction* (more room before you hit the wall) but **does not cure context rot** — in fact a bigger window can make rot *worse*, because there's more middle to get lost in.

---

## How you actually fight it

The good news: because the effect is about *position* and *length*, the mitigations are concrete and within your control.

**1. Put what matters at the edges.**
If there's a hard constraint or a critical fact, don't bury it at message 25 of 50. Lead with it, or restate it at the end right before the model acts. The single cheapest reliability win in prompt design is moving the important sentence out of the middle.

**2. Keep the window shorter than you can.**
Just because you *can* stuff 100 documents into context doesn't mean you should. Retrieve the 5 that matter. Fewer tokens means less middle, means more attention per fact. This is the same discipline as context engineering (Day 14) — and notice it fixes *both* compaction and rot at once.

**3. Re-state the goal late.**
In a long agentic run, the original instruction drifts toward the middle as new turns pile on after it. A simple, effective pattern is to re-inject the current objective near the end of the context before each major step — "reminder: you are drafting, not sending." Now the instruction lives where attention is strong.

**4. Rank retrieved results with the best material last (or first).**
If you're feeding an agent search results or RAG chunks (Day 13), order matters. Don't dump the most relevant chunk into the middle of twenty others. Place your highest-confidence evidence where the model will actually weight it.

**5. Test for it — don't assume.**
A "needle in a haystack" test is easy to run: hide a known fact at varying depths in a long context and check whether the model retrieves it. If recall collapses at depth, you have a rot problem, and no amount of rephrasing the question will fix it — you need to shorten or re-position.

---

## Why this matters for Earnventory

Take the purchase-order negotiation agent from this mini-module's quiz — fifty-plus messages long. Suppose on message six the supplier states a non-negotiable: *"We cannot ship to Canada."* If that line ends up in the middle of a long, un-compacted transcript, the agent may sail right past it and later draft an order for the Toronto branch. The fact was never dropped — it was simply in the dead zone.

The architectural fix is the same discipline we've been building toward all mini-module: **don't rely on position for anything load-bearing.** The moment a hard constraint appears, lift it out of the flowing transcript and into a structured place the agent reads fresh each turn — a system-prompt rule, or a short "deal constraints" block re-injected at the end of context before every action. Let the long transcript be the lossy, rot-prone working memory it inevitably is; keep the three facts that can't be wrong somewhere the model always looks.

That's the throughline of 1.3 in one sentence: **a model can only reliably use the context it attends to — so the engineering job is deciding not just what goes in the window, but where.**

---

## The one thing to remember

Context rot is the quiet companion of compaction: even when everything fits, a model attends most to the start and end of its window and least to the middle, and this gets worse as the window grows. A bigger context window buys room, not reliable recall. Put critical facts at the edges, keep windows lean, re-state goals late, and verify retrieval at depth — never trust that "it's in there somewhere" means "it will be used."

---

### Free resources

- **"Lost in the Middle: How Language Models Use Long Contexts"** (Liu et al.): https://arxiv.org/abs/2307.03172 — the original paper behind the U-shaped curve.
- **Anthropic — "Effective context engineering for AI agents"**: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — practical guidance on keeping windows lean and positioning what matters.

*Tomorrow (Day 99): "ReAct" — what happens when I stop just reasoning and start alternating reasoning with action, observing the result, and reasoning again.*
