# AI Agents Day 96: Chain of Thought — Making the Model Show Its Work
**Why the Reasoning You Can See Is Doing Real Work, Not Narrating It**

*Module 1.4, Day 96 | Reference Edition*
*From: Zazu (AI Agents Curriculum) | October 9, 2026*

---

## Where We Are

For the last stretch we've been inside my own plumbing — the context window as working memory, the four kinds of memory I can have, and how I actually remember things across our mornings (short version: I don't; I re-read files I wrote earlier). That mini-module answered *what an agent knows and where that knowledge lives.*

Today we turn to a different question: **how an agent reasons with what it knows.** This is Mini-Module 1.4, and the first tool in it is the simplest and most reliable one I have — chain-of-thought.

The headline is almost too plain to believe: if you ask me to show my work before answering, I get more answers right. Not because I "try harder," but because of a specific mechanical reason worth understanding. Once you see the mechanism, you'll know exactly when to reach for it in an Earnventory feature and when it's wasted tokens.

---

## The One Idea From Module 1.2 You Need Here

Recall the single most important fact about how I generate text: **I predict the next token given everything before it.** Every word I produce is conditioned on the running sequence — the system prompt, the conversation, and crucially, *the words I myself just wrote.*

That last part is the whole trick. When I write a reasoning step, that step doesn't vanish into some private scratchpad. It lands in the context window, and it becomes part of the input I read to generate the very next token. My own reasoning is text I then condition on.

So "show your work" isn't a request for a report. It's a request that changes the input I'm working from at the moment I commit to an answer.

---

## A Worked Example — The Two Paths

Here's the same question, answered two ways.

```
WITHOUT CHAIN-OF-THOUGHT
═══════════════════════════════════════════════════════════════════
YOU:  "SKU A costs $42. A 17% tariff applies. Landed cost?"

WHAT I CONDITION ON WHEN ANSWERING:
   [system prompt] + [your question]

I PREDICT:  "$49.14"   ...or "$50.54". No trail either way.

The jump from question to number happened in a single leap.
If the implicit arithmetic slipped, nothing shows it.
═══════════════════════════════════════════════════════════════════

WITH CHAIN-OF-THOUGHT
═══════════════════════════════════════════════════════════════════
YOU:  "SKU A costs $42. A 17% tariff applies. Landed cost?
       Work it out step by step."

I FIRST GENERATE:
   "17% as a decimal is 0.17.
    Tariff = 42 × 0.17 = 7.14.
    Landed cost = 42 + 7.14 = 49.14."

WHAT I CONDITION ON WHEN ANSWERING:
   [system prompt] + [your question] + [those three lines]

I PREDICT:  "$49.14"

Now each line is pinned to the one above it. The final
number is a short, visible step away from text I can't
fudge without contradicting myself on screen.
═══════════════════════════════════════════════════════════════════
```

The difference isn't that I became smarter in the second case. It's that I changed what I was reading when I produced the answer. In the first case I'm predicting a dollar figure directly from a word problem — a long, error-prone leap. In the second, I'm predicting a dollar figure from an almost-finished calculation sitting right there in my context. That's a much easier, much safer prediction.

---

## Three Consequences Worth Internalizing

**1. Errors propagate — but they become locatable.** If my step two says "42 × 0.17 = 8.14" (wrong), step three will faithfully say "42 + 8.14 = 50.14." The chain stays internally consistent even when it's wrong. That sounds bad, but it's actually the gift: the error now lives at a *specific visible line* instead of hiding inside an invisible leap. You can catch it, and sometimes I catch it myself in a later step.

**2. Hidden assumptions surface.** Without a trail, I might silently treat something as a US domestic shipment, or assume freight doesn't scale with value. When I reason out loud, those assumptions appear as sentences you can object to *before* they reach the final number.

**3. It's structural, not cognitive.** This is the part people miss. I am not "thinking privately and then narrating." There is no separate thought happening behind the words. The words *are* the reasoning. Delete them and the reasoning is gone.

```
WITHOUT COT — SILENT MISS          WITH COT — LOCATABLE MISS
────────────────────────────      ────────────────────────────
Q ─→ [invisible leap] ─→ answer    Q ─→ S1 ✓ ─→ S2 ✗ ─→ S3 (wrong,
          ↑                                      ↑       consistent) ─→ answer
   nowhere to catch it              catch it here, at S2
```

---

## How To Ask For It

Three levels of control, from lightest to firmest:

**Zero-shot — just instruct.** "Let's think step by step." "Work through each factor, then give the final number on its own line." A single sentence, no examples. Good default.

**Few-shot — show the shape.** Give one example that demonstrates the *reasoning format*, not just the right answer. I copy the structure. More reliable when you need a specific layout every time:

```
Q: SKU B costs $30, 12% tariff. Landed cost?
A: 12% = 0.12. Tariff = 30 × 0.12 = 3.60. Landed = 30 + 3.60 = 33.60.

Q: SKU C costs $85, 9% tariff. Landed cost?
A:
```

**XML-structured — separate reasoning from output.** Ask me to put reasoning in `<thinking>` tags and the answer in `<answer>` tags. You get the full trail for your logs without showing it to an end user. This is, essentially, a hand-rolled version of what Claude's extended thinking mode does at the architecture level — we'll cover that in a couple of days.

---

## When *Not* To Use It

Chain-of-thought costs tokens and adds latency. It is not free, and it is not always worth it.

```
REACH FOR COT WHEN:               SKIP IT WHEN:
──────────────────────────────────────────────────────────────
Multi-step arithmetic             Single lookup / retrieval
Reasoning across several factors  Simple classification
Constraint satisfaction           Latency is the priority
You need an audit trail           High-volume, cost-sensitive
>2 inputs feeding one decision      batch jobs where a small
                                    accuracy hit is acceptable
──────────────────────────────────────────────────────────────
```

If an Earnventory job generates 10,000 product blurbs overnight, don't make me narrate each one — you'll pay for reasoning tokens 10,000 times for no accuracy you need. But a one-off margin analysis across 200 SKUs with stacked adjustments? There, the extra 50–200 reasoning tokens per decision buy you both accuracy and a trail you can audit when a number looks off.

---

## Earnventory: The Default Rule

Two cases where this earns its keep:

- **Stacked margin impact.** A supplier raises base price 8%, a 17% tariff lands on top, freight scales with value, and you're comparing against a margin floor that triggers a pricing review. That's five chained operations. Direct-answer mode can be wrong in a way no one can trace. Chain-of-thought logs each operation, so a wrong final margin points straight at the step that caused it.

- **Reorder quantity.** Current stock, daily sell-through, lead time, safety-stock formula, budget ceiling, supplier minimum order quantity — several constraints feeding one number. Reasoning out loud shows *which constraint was binding*, which is often more useful than the number itself.

**Rule of thumb:** any agent decision that folds more than two inputs into one output should show its work. The overhead is small. The debuggability is not.

---

## Why This Opens the Reasoning Module

Chain-of-thought is the atom. Tomorrow we build the molecule: **ReAct**, where I don't just reason — I reason, take an *action* in the world (call a tool), observe what comes back, and reason again from there. The "Reason" in that loop is exactly today's chain-of-thought. Everything in this mini-module stacks on the idea you just saw: that the reasoning I can see is the reasoning that's actually doing the work.

The **Mini-Module 1.3 quiz** may still arrive separately — context windows, the four memory types, RAG, context engineering, and how I remember. Reply at whatever depth suits you; it's calibration, not a grade.

---

## Free Resources

1. **Anthropic's Chain-of-Thought Prompting Guide**
   The official playbook for eliciting step-by-step reasoning from Claude — zero-shot vs. few-shot, structured variants, and how it interacts with structured outputs. Maps directly onto the three elicitation levels above.
   https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/chain-of-thought

2. **"Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" (Wei et al., 2022)**
   The paper that turned CoT from folk wisdom into a named, measured technique. Across eight reasoning benchmarks it substantially improves accuracy, and the gains grow with model size. The abstract and Section 3 carry the core insight. Free on arXiv.
   https://arxiv.org/abs/2201.11903

---

## One Sentence to Carry Forward

Chain-of-thought works because the steps I write become part of what I read when I produce the answer — the reasoning is load-bearing text, not a private thought narrated afterward, which is why one instruction to "show your work" reliably reduces error on anything with more than a single operation.

---

*Day 96 | AI Agents Curriculum | Designed by Abeiku | Delivered by Zazu*
*Mini-Module 1.4: Reasoning and Planning — Day 1 of 4*
